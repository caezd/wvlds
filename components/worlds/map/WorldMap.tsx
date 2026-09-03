"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useResetOnKeyChange } from "@/hooks/useResetOnKeyChange";
// `Map` est renommée : l'icône masquait le `Map` natif, dont le suivi des
// pointeurs (pincement) a besoin.
import { Check, Loader2, Map as MapIcon, MapPin, Pencil, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { channel } from "@/lib/constants";
import { openRealtimeChannel } from "@/lib/realtimeChannel";
import { toWebP } from "@/lib/imageUtils";
import { supabaseThumb } from "@/lib/storage";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import {
  createMapPin,
  deleteMapPin,
  getWorldMap,
  updateMapPin,
  upsertWorldMap,
  type MapPin as MapPinType,
  type WorldMapData,
} from "@/app/actions/worldMap";

// Les quatre pièces de l'interface d'un point — marqueur, panneau flottant,
// dialogue d'apparence, sélecteur de couleur — vivent à côté. Ce fichier ne
// garde que la carte elle-même : chargement, image de fond, pose des points.
import { PinMarker } from "./PinMarker";
import { PinPopover } from "./PinPopover";
import { FLECHE, calcPopoverPos, pinAnchor } from "./popoverPosition";
import {
  applyZoom,
  clampOffset,
  coverSize,
  initialTransform,
  distance,
  midpoint,
  pinchScale,
  wheelScale,
  type MapBounds,
  type MapTransform,
  type Point,
} from "./zoom";
import type { PinPopoverPos, PendingPin, WikiPageOption } from "./types";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";

/**
 * Largeur servie pour l'affichage nominal de la carte.
 *
 * Un palier unique, et non la largeur mesurée du cadre : celle-ci diffère à
 * chaque écran, donc une URL par visiteur, donc un téléchargement par visiteur
 * — le cache du navigateur ne peut rien pour une image qu'on ne lui redemande
 * jamais à l'identique. Même raisonnement que les paliers d'avatars
 * (`AVATAR_THUMB_SMALL`/`LARGE` dans `lib/storage.ts`).
 *
 * L'original, lui, peut peser jusqu'à 4096 px de large : il n'est demandé qu'au
 * premier agrandissement, quand ses pixels servent enfin à quelque chose.
 */
const MAP_THUMB_WIDTH = 1600;

const IDENTITY: MapTransform = { scale: 1, x: 0, y: 0 };

/** Écart au-delà duquel un geste est un déplacement, et non un clic. */
const DRAG_THRESHOLD_PX = 4;

/** Carte et épingles résolues côté serveur, quand l'onglet est ouvert d'emblée. */
export type InitialWorldMap = { map: WorldMapData | null; pins: MapPinType[] };

// ── Main component ─────────────────────────────────────────────────

export function WorldMap({
  worldId,
  userId,
  canEdit,
  initialMap,
}: {
  worldId: string;
  userId: string;
  canEdit: boolean;
  /**
   * Carte et épingles déjà chargées par le rendu serveur. Absentes quand
   * l'onglet est ouvert depuis le client : le composant les charge alors
   * lui-même.
   */
  initialMap?: InitialWorldMap | null;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const supabase = createClient();
  const reconnectEpoch = useReconnectEpoch();

  const [mapData, setMapData] = React.useState<WorldMapData | null>(initialMap?.map ?? null);
  const [pins, setPins] = React.useState<MapPinType[]>(initialMap?.pins ?? []);
  const [loading, setLoading] = React.useState(!initialMap);
  const [editMode, setEditMode] = React.useState(false);

  const [selectedPin, setSelectedPin] = React.useState<MapPinType | null>(null);
  const [popoverPos, setPopoverPos] = React.useState<PinPopoverPos | null>(null);

  const [pendingPin, setPendingPin] = React.useState<PendingPin | null>(null);
  const [creatingPin, setCreatingPin] = React.useState(false);

  const [uploadingMap, setUploadingMap] = React.useState(false);
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [fullResolution, setFullResolution] = React.useState(false);

  const [isPanning, setIsPanning] = React.useState(false);

  const mapFileInputRef = React.useRef<HTMLInputElement>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const popoverPanelRef = React.useRef<HTMLDivElement | null>(null);
  const wheelCleanupRef = React.useRef<(() => void) | null>(null);

  const isEditMode = canEdit && editMode;

  // ── Déplacement et agrandissement ─────────────────────────────
  //
  // La transformation vit dans une ref et s'écrit directement sur le DOM, une
  // fois par image (`requestAnimationFrame`). Elle passait auparavant par
  // `useState` : chaque pixel de déplacement re-rendait la carte ET ses N
  // marqueurs, chacun remontant son icône. Les calculs eux-mêmes sont dans
  // `zoom.ts`, vérifiables sans navigateur.
  const transformRef = React.useRef<MapTransform>(IDENTITY);
  const rafRef = React.useRef<number | null>(null);
  const selectedPinRef = React.useRef<MapPinType | null>(null);
  selectedPinRef.current = selectedPin;
  const mapDataRef = React.useRef<WorldMapData | null>(mapData);
  mapDataRef.current = mapData;
  const fullResolutionAskedRef = React.useRef(false);
  /** La vue par défaut n'est posée qu'une fois par carte. */
  const initialViewDoneRef = React.useRef(false);

  // ── Ajustement de la carte au cadre ───────────────────────────
  // La carte était posée en pleine largeur : sur un cadre plus haut que large
  // — un téléphone — elle n'occupait qu'un bandeau, le reste en fond noir. On
  // la met à la plus petite taille qui COUVRE le cadre, et c'est cette taille
  // qui fait l'échelle 1 : le fond ne peut donc jamais réapparaître.
  const [baseSize, setBaseSize] = React.useState({ width: 0, height: 0 });
  const baseSizeRef = React.useRef(baseSize);
  baseSizeRef.current = baseSize;
  const naturalRef = React.useRef<{ width: number; height: number } | null>(null);

  const measure = React.useCallback(() => {
    const container = containerRef.current;
    const natural = naturalRef.current;
    if (!container || !natural) return;
    const next = coverSize(
      { width: container.clientWidth, height: container.clientHeight },
      natural,
    );
    setBaseSize((prev) =>
      prev.width === next.width && prev.height === next.height ? prev : next,
    );
  }, []);

  const pointers = React.useRef(new Map<number, Point>());
  const pinch = React.useRef<{ distance: number; scale: number } | null>(null);
  const panStart = React.useRef<
    { clientX: number; clientY: number; x: number; y: number } | null
  >(null);
  const didPan = React.useRef(false);
  const popoverSyncRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Position à l'écran du panneau d'une épingle, ancrée sur l'épingle elle-même. */
  const popoverPosFor = React.useCallback((pin: MapPinType): PinPopoverPos | null => {
    const img = imageRef.current;
    if (!img) return null;
    // Le rectangle mesuré tient déjà compte de la transformation du parent.
    const ancre = pinAnchor(img.getBoundingClientRect(), pin);
    // Hauteur réelle du panneau dès qu'il est monté : un panneau sans bannière
    // ni description fait la moitié de la hauteur supposée, et se poserait
    // loin au-dessus de son épingle.
    const hauteur = popoverPanelRef.current?.offsetHeight || undefined;
    return calcPopoverPos(ancre.x, ancre.y, undefined, hauteur);
  }, []);

  /** Écrit la transformation courante sur le DOM — hors de React. */
  const paint = React.useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const { scale, x, y } = transformRef.current;
    wrapper.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    // Les marqueurs se remettent à l'endroit avec cette variable plutôt qu'avec
    // une prop : ils ne re-rendent donc pas d'un cran de zoom à l'autre.
    wrapper.style.setProperty("--pin-inv-scale", String(1 / scale));

    // Le panneau ouvert reste collé à son épingle : il était posé une fois pour
    // toutes à l'endroit du clic, et le moindre déplacement de la carte le
    // laissait en plan, désigner un lieu qui n'était plus là.
    const panel = popoverPanelRef.current;
    const pin = selectedPinRef.current;
    if (panel && pin) {
      const pos = popoverPosFor(pin);
      if (pos) {
        panel.style.left = `${pos.left}px`;
        panel.style.top = `${pos.top}px`;
        const caret = panel.querySelector<HTMLElement>("[data-pin-caret]");
        if (caret) {
          caret.style.left = `${pos.arrowLeft - FLECHE / 2}px`;
          caret.dataset.placement = pos.placement;
        }
      }
    }
  }, [popoverPosFor]);

  const schedulePaint = React.useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      paint();
    });
  }, [paint]);

  // Remettre les jetons à `null`, et pas seulement annuler : `schedulePaint` se
  // fie à `rafRef.current` pour savoir s'il a déjà une image en attente. Un
  // jeton annulé mais laissé en place le convainc pour toujours qu'il n'a rien
  // à faire — et plus rien ne se repeint.
  //
  // Ce n'est pas un cas de bord : Next.js active `reactStrictMode` par défaut,
  // et React monte alors le composant, exécute ce nettoyage, puis le remonte.
  // En développement, le zoom et le déplacement étaient donc morts dès le
  // premier rendu, sans la moindre erreur en console.
  React.useEffect(() => () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (popoverSyncRef.current) {
      clearTimeout(popoverSyncRef.current);
      popoverSyncRef.current = null;
    }
  }, []);

  /**
   * Recopie dans l'état React la position que le geste vient d'écrire sur le
   * DOM. Sans ce rattrapage, le premier rendu venu — un survol, une mise à jour
   * temps réel — replacerait le panneau là où il était au début du geste.
   */
  const syncPopoverPos = React.useCallback(() => {
    if (popoverSyncRef.current) clearTimeout(popoverSyncRef.current);
    popoverSyncRef.current = setTimeout(() => {
      const pin = selectedPinRef.current;
      if (!pin) return;
      const pos = popoverPosFor(pin);
      if (pos) setPopoverPos(pos);
    }, 120);
  }, [popoverPosFor]);

  /**
   * Bornes du geste : le cadre tel qu'il est à l'écran, et la carte à la taille
   * que `fitSize` lui a donnée.
   *
   * La taille vient de l'état et non d'une relecture de l'image : c'est lui qui
   * fait autorité — le DOM ne fait que le refléter — et on évite au passage un
   * calcul de mise en page à chaque image d'un déplacement.
   *
   * Lue depuis une ref pour que cette fonction garde son identité : la
   * `callback ref` du cadre en dépend, et la voir changer à chaque
   * redimensionnement détacherait puis rattacherait l'écoute de la molette.
   */
  const bounds = React.useCallback((): MapBounds | null => {
    const container = containerRef.current;
    if (!container) return null;
    return {
      containerWidth: container.clientWidth,
      containerHeight: container.clientHeight,
      imageWidth: baseSizeRef.current.width,
      imageHeight: baseSizeRef.current.height,
    };
  }, []);

  /**
   * L'original remplace la vignette dès que la carte est affichée plus grande
   * qu'elle, et une seule fois.
   *
   * Le seuil est la taille RÉELLEMENT affichée, pas le simple fait d'avoir
   * zoomé : sur un téléphone, la vue par défaut tient largement dans la
   * vignette, et l'original — jusqu'à 4096 px de large — n'a aucune raison
   * d'être téléchargé.
   */
  const requestFullResolution = React.useCallback((scale: number) => {
    const url = mapDataRef.current?.image_url;
    if (fullResolutionAskedRef.current || !url) return;
    if (baseSizeRef.current.width * scale <= MAP_THUMB_WIDTH) return;
    fullResolutionAskedRef.current = true;
    // Préchargé hors écran : l'échange de `src` se fait alors sur une image
    // déjà en cache, sans le blanc d'un rechargement.
    const preload = new window.Image();
    preload.onload = () => setFullResolution(true);
    preload.src = url;
  }, []);

  const setTransform = React.useCallback(
    (next: MapTransform) => {
      if (next === transformRef.current) return;
      transformRef.current = next;
      requestFullResolution(next.scale);
      schedulePaint();
    },
    [requestFullResolution, schedulePaint],
  );

  // Retour à l'échelle 1 quand l'image change — et SEULEMENT alors.
  //
  // Les refs sont attachées avant que les effets ne s'exécutent : au montage,
  // l'image déjà en cache a donc livré ses dimensions et le cadre a été mesuré
  // AVANT que cet effet ne parte. Le laisser s'exécuter là effaçait cette
  // mesure, et la carte restait à zéro faute d'un second déclencheur.
  const lastImageUrlRef = React.useRef(mapData?.image_url ?? null);
  React.useEffect(() => {
    const url = mapData?.image_url ?? null;
    if (lastImageUrlRef.current === url) return;
    lastImageUrlRef.current = url;

    transformRef.current = IDENTITY;
    fullResolutionAskedRef.current = false;
    initialViewDoneRef.current = false;
    naturalRef.current = null;
    setBaseSize({ width: 0, height: 0 });
    setFullResolution(false);
    setImageLoaded(false);
    schedulePaint();
  }, [mapData?.image_url, schedulePaint]);

  // React attache les refs des enfants avant celles de leurs parents : quand
  // l'image en cache signale ses dimensions, le cadre n'est pas encore connu et
  // la mesure ne peut pas aboutir. Cet effet, lui, s'exécute une fois tout en
  // place.
  React.useEffect(() => { measure(); }, [measure, imageLoaded]);

  // La taille ajustée vient de changer (image chargée, cadre redimensionné).
  //
  // À la première mesure, on pose la vue par défaut : la carte remplit le
  // cadre. Ensuite, plus jamais — redimensionner la fenêtre ne doit pas
  // ramener de force quelqu'un qui s'était déplacé et avait choisi son zoom ;
  // on se contente alors de re-borner son décalage.
  React.useEffect(() => {
    const b = bounds();
    if (!b || !baseSize.width) return;

    if (initialViewDoneRef.current) {
      const { scale, x, y } = transformRef.current;
      transformRef.current = { scale, ...clampOffset(x, y, scale, b) };
    } else {
      initialViewDoneRef.current = true;
      transformRef.current = initialTransform(b);
      requestFullResolution(transformRef.current.scale);
    }
    schedulePaint();
    syncPopoverPos();
  }, [baseSize.width, baseSize.height, bounds, requestFullResolution, schedulePaint, syncPopoverPos]);

  // Le cadre change de taille (fenêtre, tiroir latéral) : les bornes du
  // déplacement changent avec lui, et le panneau ouvert doit suivre.
  React.useEffect(() => {
    function onResize() {
      measure();
      const b = bounds();
      if (b) {
        const { scale, x, y } = transformRef.current;
        transformRef.current = { scale, ...clampOffset(x, y, scale, b) };
      }
      schedulePaint();
      syncPopoverPos();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bounds, measure, schedulePaint, syncPopoverPos]);

  // ── Chargement initial ────────────────────────────────────────
  React.useEffect(() => {
    if (initialMap) return;
    let cancelled = false;
    (async () => {
      try {
        const { map, pins: p } = await getWorldMap(worldId);
        if (!cancelled) {
          setMapData(map);
          setPins(p);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  // ── Temps réel ────────────────────────────────────────────────
  React.useEffect(() => {
    type RT = { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> };

    return openRealtimeChannel(supabase, channel.worldMap(worldId), (ch) =>
      ch
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "world_map_pins", filter: `world_id=eq.${worldId}` },
          (payload: RT) => {
            if (payload.eventType === "INSERT") {
              // Fusion plutôt qu'ajout : Postgres nous renvoie AUSSI les
              // épingles que l'on vient de créer soi-même, déjà posées à
              // l'écran sans attendre le serveur. Les ajouter en aveugle
              // faisait apparaître le lieu en double, avec deux fois la même
              // clé React.
              setPins((prev) => mergePin(prev, payload.new as MapPinType));
            } else if (payload.eventType === "UPDATE") {
              const updated = payload.new as MapPinType;
              setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
              setSelectedPin((prev) => (prev?.id === updated.id ? updated : prev));
            } else if (payload.eventType === "DELETE") {
              const id = (payload.old as { id: string }).id;
              setPins((prev) => prev.filter((p) => p.id !== id));
              setSelectedPin((prev) => (prev?.id === id ? null : prev));
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "world_maps", filter: `world_id=eq.${worldId}` },
          (payload: RT) => {
            setMapData(payload.new as WorldMapData);
          },
        )
        .subscribe(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, reconnectEpoch]);

  // ── Pages du wiki, chargées une fois pour tous les panneaux ────
  const [wikiPages, setWikiPages] = React.useState<WikiPageOption[]>([]);
  const wikiPagesAskedRef = React.useRef(false);
  const loadWikiPages = React.useCallback(() => {
    if (wikiPagesAskedRef.current) return;
    wikiPagesAskedRef.current = true;
    void supabase
      .from("world_wiki_pages")
      .select("id, title, slug")
      .eq("world_id", worldId)
      .eq("is_folder", false)
      .is("deleted_at", null)
      .order("title")
      .then(({ data }: { data: WikiPageOption[] | null }) => setWikiPages(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  // Passer d'un monde à l'autre est une navigation client : ce composant n'est
  // pas remonté et ses états gardent la carte du monde quitté. Le chargement,
  // lui, ne repart plus quand le serveur a déjà fourni les données — d'où ce
  // resemis explicite.
  useResetOnKeyChange(worldId, () => {
    setMapData(initialMap?.map ?? null);
    setPins(initialMap?.pins ?? []);
    setLoading(!initialMap);
    setSelectedPin(null);
    setPopoverPos(null);
    setPendingPin(null);
    setEditMode(false);
    setWikiPages([]);
    wikiPagesAskedRef.current = false;
  });

  // ── Libellé de la carte ───────────────────────────────────────
  // La colonne `label` existait depuis la première migration sans que rien ne
  // l'écrive ni ne l'affiche : chaque monde avait donc « Carte » pour titre,
  // là où le wiki, lui, se laisse renommer.
  const mapLabel = mapData?.label?.trim() || t("title");
  const [labelDraft, setLabelDraft] = React.useState(mapData?.label ?? "");
  React.useEffect(() => { setLabelDraft(mapData?.label ?? ""); }, [mapData?.label]);

  async function handleLabelCommit() {
    const value = labelDraft.trim();
    if (!mapData || value === (mapData.label ?? "")) return;
    try {
      const updated = await upsertWorldMap(worldId, { label: value || t("title") });
      setMapData(updated);
    } catch {
      toast.error(t("saveError"));
      setLabelDraft(mapData.label ?? "");
    }
  }

  // ── Upload de l'image de carte ────────────────────────────────
  async function handleMapImageUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error(t("imagesOnly"));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(t("fileTooLarge20"));
      return;
    }
    setUploadingMap(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(ERR_NON_AUTHENTIFIE);

      const converted = await toWebP(file, 4096);
      const path = `user-${userId}/world-${worldId}/map-${Date.now()}.webp`;

      const { error: upErr } = await supabase.storage
        .from("worlds")
        .upload(path, converted, { upsert: true, contentType: converted.type });
      if (upErr) throw upErr;

      const image_url = supabase.storage.from("worlds").getPublicUrl(path).data.publicUrl;
      const updated = await upsertWorldMap(worldId, { image_url });
      setMapData(updated);
      toast.success(t("mapUpdated"));
    } catch {
      toast.error(t("uploadError"));
    } finally {
      setUploadingMap(false);
    }
  }

  // ── Molette : agrandissement centré sur le curseur ────────────
  // Callback ref : s'exécute quand l'élément entre/sort du DOM, et permet
  // d'écouter `wheel` en non-passif (donc d'annuler le défilement de la page).
  const containerCallbackRef = React.useCallback((el: HTMLDivElement | null) => {
    if (wheelCleanupRef.current) {
      wheelCleanupRef.current();
      wheelCleanupRef.current = null;
    }
    containerRef.current = el;
    if (!el) return;
    const node = el; // variable non-nullable pour la closure

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const b = bounds();
      if (!b) return;
      const rect = node.getBoundingClientRect();
      setTransform(
        applyZoom(
          transformRef.current,
          wheelScale(transformRef.current.scale, e.deltaY),
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          b,
        ),
      );
      syncPopoverPos();
    }

    node.addEventListener("wheel", onWheel, { passive: false });

    // Le cadre se redimensionne sans que la fenêtre bouge : ouverture du tiroir
    // latéral, rotation d'un téléphone, panneau du wiki tiré. `ResizeObserver`
    // le voit, l'événement `resize` de la fenêtre non.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure());
    observer?.observe(node);
    measure();

    wheelCleanupRef.current = () => {
      node.removeEventListener("wheel", onWheel);
      observer?.disconnect();
    };
  }, [bounds, measure, setTransform, syncPopoverPos]);

  /**
   * Ref de l'image, doublée d'un contrôle de `complete`.
   *
   * Une image déjà en cache peut être chargée AVANT que React n'attache son
   * `onLoad` : sans cette vérification à l'attachement, elle resterait à
   * `opacity: 0` pour toujours — carte blanche, épingles suspendues dans le
   * vide. (Même écueil que `components/ui/stored-image.tsx`.)
   */
  const imageCallbackRef = React.useCallback((node: HTMLImageElement | null) => {
    imageRef.current = node;
    if (node?.complete && node.naturalWidth > 0) {
      naturalRef.current = { width: node.naturalWidth, height: node.naturalHeight };
      measure();
      setImageLoaded(true);
    }
  }, [measure]);

  /** Position d'un pointeur dans le repère du cadre. */
  function pointerPos(e: React.PointerEvent): Point | null {
    const node = containerRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const pos = pointerPos(e);
    if (!pos) return;
    pointers.current.set(e.pointerId, pos);
    // Appel facultatif : le navigateur refuse la capture d'un pointeur qui
    // n'est plus actif, et jsdom ne l'implémente pas du tout.
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (pointers.current.size >= 2) {
      // Deux doigts : on pince. Le déplacement en cours s'arrête là, et le
      // geste ne pourra plus être pris pour un clic.
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: distance(a, b), scale: transformRef.current.scale };
      panStart.current = null;
      didPan.current = true;
      setIsPanning(false);
      return;
    }

    didPan.current = false;
    panStart.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      x: transformRef.current.x,
      y: transformRef.current.y,
    };
    setIsPanning(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const pos = pointerPos(e);
    if (!pos) return;
    pointers.current.set(e.pointerId, pos);

    const b = bounds();
    if (!b) return;

    if (pinch.current && pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()];
      setTransform(
        applyZoom(
          transformRef.current,
          pinchScale(pinch.current.scale, pinch.current.distance, distance(p1, p2)),
          midpoint(p1, p2),
          b,
        ),
      );
      return;
    }

    if (!panStart.current) return;
    const dx = e.clientX - panStart.current.clientX;
    const dy = e.clientY - panStart.current.clientY;
    if (!didPan.current && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
      didPan.current = true;
    }
    if (!didPan.current) return;
    const { scale } = transformRef.current;
    transformRef.current = {
      scale,
      ...clampOffset(panStart.current.x + dx, panStart.current.y + dy, scale, b),
    };
    schedulePaint();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    // Un doigt encore posé après un pincement ne reprend pas le déplacement au
    // vol : la carte sauterait de la position du pincement à la sienne.
    panStart.current = null;
    if (pointers.current.size === 0) setIsPanning(false);
    syncPopoverPos();
    // didPan.current est relu dans handleContainerClick qui s'exécute juste après
  }

  // ── Clic sur la carte (ajouter un pin si pas de drag) ────────
  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (didPan.current) { didPan.current = false; return; }
    didPan.current = false;

    if (pendingPin) { setPendingPin(null); return; }
    if (selectedPin) { closePopover(); return; }

    if (!isEditMode) return;

    const img = imageRef.current;
    if (!img) return;
    // Le rectangle mesuré tient compte de la transformation : le pourcentage se
    // lit directement, sans refaire le calcul du déplacement et de l'échelle.
    const r = img.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    if (x < 0 || x > 100 || y < 0 || y > 100) return;
    setPendingPin({ x, y, title: "" });
  }

  function closePopover(refocusPin = false) {
    const id = selectedPinRef.current?.id;
    setSelectedPin(null);
    setPopoverPos(null);
    // Fermé au clavier, le panneau renverrait sinon le focus au début du
    // document, et le lieu que l'on venait de lire serait à retrouver.
    if (refocusPin && id) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-pin-id="${id}"]`)?.focus();
      });
    }
  }

  // Échap ferme le panneau ouvert. Le garde sur `defaultPrevented` laisse la
  // main aux boîtes de dialogue empilées par-dessus (apparence de l'épingle,
  // confirmation de suppression) : elles se ferment les premières.
  React.useEffect(() => {
    if (!selectedPin) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      closePopover(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedPin]);

  // Le panneau vient d'apparaître : sa hauteur réelle n'était pas connue quand
  // on l'a placé. On le repositionne avant la peinture — un effet de mise en
  // page, donc sans le voir sauter.
  React.useLayoutEffect(() => {
    const pin = selectedPinRef.current;
    if (!pin || !popoverPanelRef.current) return;
    const pos = popoverPosFor(pin);
    if (!pos) return;
    setPopoverPos((prev) =>
      prev && prev.top === pos.top && prev.left === pos.left && prev.placement === pos.placement
        ? prev
        : pos,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPin?.id]);

  function openPopover(pin: MapPinType) {
    loadWikiPages();
    setSelectedPin(pin);
    setPopoverPos(popoverPosFor(pin));
    setPendingPin(null);
  }

  async function handleCreatePin() {
    if (!pendingPin || !pendingPin.title.trim() || creatingPin) return;
    setCreatingPin(true);
    try {
      const pin = await createMapPin(worldId, pendingPin.x, pendingPin.y, pendingPin.title.trim());
      setPins((prev) => mergePin(prev, pin));
      setPendingPin(null);
      openPopover(pin);
    } catch {
      toast.error(t("createPinError"));
    } finally {
      setCreatingPin(false);
    }
  }

  function handlePinClick(pin: MapPinType) {
    if (selectedPin?.id === pin.id) {
      closePopover();
      return;
    }
    openPopover(pin);
  }

  async function handlePinMoved(pin: MapPinType, x: number, y: number) {
    // Optimiste : mise à jour locale immédiate
    const updated = { ...pin, x, y };
    setPins((prev) => prev.map((p) => (p.id === pin.id ? updated : p)));
    if (selectedPin?.id === pin.id) setSelectedPin(updated);
    try {
      await updateMapPin(pin.id, { x, y });
    } catch {
      toast.error(t("movePinError"));
      // Rollback
      setPins((prev) => prev.map((p) => (p.id === pin.id ? pin : p)));
    }
  }

  async function handleDeletePin(pin: MapPinType) {
    try {
      await deleteMapPin(pin.id);
      setPins((prev) => prev.filter((p) => p.id !== pin.id));
      if (selectedPin?.id === pin.id) closePopover();
      toast.success(t("pinDeleted"));
    } catch {
      toast.error(t("deletePinError"));
    }
  }

  // ── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const imageSrc = mapData?.image_url
    ? (fullResolution
        ? mapData.image_url
        : supabaseThumb(mapData.image_url, MAP_THUMB_WIDTH) ?? mapData.image_url)
    : null;

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      onClick={() => {
        if (pendingPin) setPendingPin(null);
        if (selectedPin) closePopover();
      }}
    >
      <WorldPanelHeader
        icon={<MapIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={
          isEditMode && mapData ? (
            <input
              value={labelDraft}
              aria-label={t("mapLabel")}
              placeholder={t("title")}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={() => void handleLabelCommit()}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setLabelDraft(mapData.label ?? "");
                  e.currentTarget.blur();
                }
              }}
              className="w-40 rounded-md border border-border-soft bg-background px-2 py-0.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary"
            />
          ) : (
            mapLabel
          )
        }
        right={
          canEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditMode((v) => !v); closePopover(); setPendingPin(null); }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                isEditMode
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border-soft bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Pencil className="h-3 w-3" />
              {isEditMode ? t("editingActive") : tCommon("edit")}
            </button>
          )
        }
      >
        {canEdit && isEditMode && mapData?.image_url && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); mapFileInputRef.current?.click(); }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {uploadingMap ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {t("changeMap")}
          </button>
        )}
      </WorldPanelHeader>

      {/* ── Corps ──────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">

        {!imageSrc ? (
          /* ── État vide ───────────────────────────────────────── */
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
            <MapIcon className="h-12 w-12 opacity-20" />
            <p className="text-sm">{t("noMapConfigured")}</p>
            {isEditMode && (
              <button
                type="button"
                onClick={() => mapFileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-dashed border-border px-6 py-3 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
              >
                {uploadingMap ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t("importMapImage")}
              </button>
            )}
          </div>
        ) : (
          /* ── Carte avec image ────────────────────────────────── */
          <div
            ref={containerCallbackRef}
            // `touch-none` : sans lui, le navigateur s'attribue le geste pour
            // faire défiler la page, et le déplacement de la carte s'interrompt
            // au premier pixel. Le pincement à deux doigts en dépend aussi.
            className="relative flex-1 touch-none overflow-hidden select-none"
            style={{ cursor: isPanning ? "grabbing" : isEditMode ? "crosshair" : "grab" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={handleContainerClick}
          >
            {/* Wrapper pan+zoom — transform-origin top-left ; la transformation
                est écrite par `paint()`, pas par le rendu React. */}
            <div
              ref={wrapperRef}
              className="absolute top-0 left-0"
              style={{
                // Dimensions explicites : c'est ce cadre-là que les épingles
                // prennent pour repère (leur position est un pourcentage), et
                // il doit donc épouser l'image au pixel près.
                width: baseSize.width || undefined,
                height: baseSize.height || undefined,
                transformOrigin: "0 0",
                "--pin-inv-scale": "1",
              } as React.CSSProperties}
            >
              {/* Image : remplit exactement l'enveloppe, dont la taille vient
                  de `fitSize`. `next/image` n'a rien à faire ici — l'image est
                  déjà servie à la bonne largeur par le stockage, et son mode
                  `fill` changerait ce dimensionnement.

                  Pas de vignette floutée en attendant, contrairement au reste de
                  l'application : les proportions de la carte ne sont pas connues
                  avant son chargement (rien en base), et un substitut aux
                  proportions approchées déplacerait les épingles de quelques
                  pourcents — elles sautilleraient à l'arrivée de l'image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageCallbackRef}
                src={imageSrc}
                alt={t("mapAlt")}
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  naturalRef.current = { width: img.naturalWidth, height: img.naturalHeight };
                  measure();
                  setImageLoaded(true);
                }}
                className={cn(
                  "block h-full w-full select-none transition-opacity duration-300 motion-reduce:transition-none",
                  imageLoaded ? "opacity-100" : "opacity-0",
                )}
                style={{ userSelect: "none" }}
              />

              {/* Pins existants */}
              {pins.map((pin) => (
                <PinMarker
                  key={pin.id}
                  pin={pin}
                  isSelected={selectedPin?.id === pin.id}
                  isEditMode={isEditMode}
                  imgRef={imageRef}
                  onPinClick={() => handlePinClick(pin)}
                  onDelete={() => void handleDeletePin(pin)}
                  onMoved={(x, y) => void handlePinMoved(pin, x, y)}
                />
              ))}

              {/* Pin en cours de création — même pivot que PinMarker (-50%,-50%) */}
              {pendingPin && (
                <div
                  className="absolute z-20"
                  style={{
                    left: `${pendingPin.x}%`,
                    top: `${pendingPin.y}%`,
                    transform: "translate(-50%, -50%) scale(var(--pin-inv-scale, 1))",
                    transformOrigin: "center center",
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Marqueur temporaire */}
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-primary opacity-70 shadow-md">
                    <MapPin className="h-4 w-4 text-white" />
                  </div>

                  {/* Formulaire flottant au-dessus */}
                  <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 flex items-center gap-1 whitespace-nowrap rounded-lg border border-border bg-background px-2 py-1.5 shadow-xl">
                    <input
                      autoFocus
                      value={pendingPin.title}
                      onChange={(e) =>
                        setPendingPin((p) => p ? { ...p, title: e.target.value } : p)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleCreatePin();
                        if (e.key === "Escape") setPendingPin(null);
                      }}
                      placeholder={t("locationName")}
                      className="w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      disabled={!pendingPin.title.trim() || creatingPin}
                      onClick={handleCreatePin}
                      className="flex h-5 w-5 items-center justify-center rounded text-primary disabled:opacity-40 hover:bg-primary/10"
                    >
                      {creatingPin ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      aria-label={tCommon("cancel")}
                      type="button"
                      onClick={() => setPendingPin(null)}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Indice d'aide en mode édition (sticky sur le container) */}
            {isEditMode && !pendingPin && (
              <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-xs text-white opacity-70">
                {t("clickToAddPin")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Popover pin sélectionné ─────────────────────────────── */}
      {selectedPin && popoverPos && (
        <PinPopover
          key={selectedPin.id}
          pin={selectedPin}
          pos={popoverPos}
          panelRef={popoverPanelRef}
          wikiPages={wikiPages}
          isEditMode={isEditMode}
          userId={userId}
          worldId={worldId}
          onClose={closePopover}
          onUpdated={(updated) => {
            setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setSelectedPin(updated);
          }}
          onDelete={() => void handleDeletePin(selectedPin)}
        />
      )}

      {/* Input fichier carte caché */}
      <input
        ref={mapFileInputRef}
        type="file"
        accept="image/*"
        // Déclenché par le bouton visible, jamais atteint au clavier :
        // le laisser dans l'arbre d'accessibilité imposerait un libellé
        // pour un champ que personne ne rencontre.
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleMapImageUpload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Ajoute une épingle, ou remplace celle qui porte déjà son identifiant. */
function mergePin(pins: MapPinType[], pin: MapPinType): MapPinType[] {
  return pins.some((p) => p.id === pin.id)
    ? pins.map((p) => (p.id === pin.id ? pin : p))
    : [...pins, pin];
}
