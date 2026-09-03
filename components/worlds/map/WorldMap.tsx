"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useResetOnKeyChange } from "@/hooks/useResetOnKeyChange";
// `Map` est renommée : l'icône masquait le `Map` natif, dont le suivi des
// pointeurs (pincement) a besoin.
import { Check, List, Loader2, Map as MapIcon, MapPin, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { channel } from "@/lib/constants";
import { openRealtimeChannel } from "@/lib/realtimeChannel";
import { toWebP } from "@/lib/imageUtils";
import { supabaseThumb, widthTierFor } from "@/lib/storage";
import { mapImagePath } from "@/lib/storagePaths";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import {
  createMapPin,
  createWorldMap,
  deleteMapPin,
  deleteWorldMap,
  getWorldMaps,
  reorderWorldMaps,
  updateMapPin,
  updateWorldMap,
  type MapPin as MapPinType,
  type WorldMapData,
} from "@/app/actions/worldMap";

// Les quatre pièces de l'interface d'un point — marqueur, panneau flottant,
// dialogue d'apparence, sélecteur de couleur — vivent à côté. Ce fichier ne
// garde que la carte elle-même : chargement, image de fond, pose des points.
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { MAP_PANEL_ID, MapTabs, mapTabId } from "./MapTabs";
import { MapPlacesPanel } from "./MapPlacesPanel";
import { PinMarker } from "./PinMarker";
import { PinPopover } from "./PinPopover";
import { FLECHE, calcPopoverPos, pinAnchor } from "./popoverPosition";
import {
  applyZoom,
  centerOn,
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
import type { PinPopoverPos, PendingPin, PinRoom, WikiPageOption } from "./types";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";

/**
 * Largeurs servies pour la carte, par ordre croissant.
 *
 * Des paliers plutôt que la largeur mesurée : celle-ci diffère à chaque écran
 * et à chaque cran de zoom, donc une URL par visiteur, donc un téléchargement
 * par visiteur — même raisonnement que les paliers d'avatars dans
 * `lib/storage.ts`.
 *
 * Deux paliers et non un seul. Le premier couvre l'affichage courant, jusqu'à
 * un écran large. Le second évite de sauter directement à l'original — qui
 * peut faire 4096 px pour trois fois le poids — dès qu'on entre un peu dans la
 * carte. L'original ne vient qu'au-delà, quand ses pixels servent enfin.
 */
const MAP_WIDTH_TIERS = [1600, 2560];

const IDENTITY: MapTransform = { scale: 1, x: 0, y: 0 };

/** Écart au-delà duquel un geste est un déplacement, et non un clic. */
const DRAG_THRESHOLD_PX = 4;

/** Cartes et épingles résolues côté serveur, quand l'onglet est ouvert d'emblée. */
export type InitialWorldMap = { maps: WorldMapData[]; pins: MapPinType[] };

// ── Main component ─────────────────────────────────────────────────

export function WorldMap({
  worldId,
  canEdit,
  initialMap,
  initialMapId,
  initialPinId,
}: {
  worldId: string;
  canEdit: boolean;
  /**
   * Carte et épingles déjà chargées par le rendu serveur. Absentes quand
   * l'onglet est ouvert depuis le client : le composant les charge alors
   * lui-même.
   */
  initialMap?: InitialWorldMap | null;
  /** Carte et lieu demandés par l'adresse (`?map=…&pin=…`). */
  initialMapId?: string | null;
  initialPinId?: string | null;
}) {
  const t = useTranslations("map");
  const tCommon = useTranslations("common");
  const supabase = createClient();
  const reconnectEpoch = useReconnectEpoch();

  // Toutes les cartes du monde, et toutes leurs épingles. Les épingles sont
  // gardées d'un bloc plutôt que rechargées à chaque onglet : passer de l'une à
  // l'autre est alors instantané.
  const [maps, setMaps] = React.useState<WorldMapData[]>(initialMap?.maps ?? []);
  const [activeMapId, setActiveMapId] = React.useState<string | null>(
    initialMapId ?? initialMap?.maps?.[0]?.id ?? null,
  );
  const [pins, setPins] = React.useState<MapPinType[]>(initialMap?.pins ?? []);
  const [creatingMap, setCreatingMap] = React.useState(false);
  const [placesOpen, setPlacesOpen] = React.useState(false);
  const [confirmDeleteMap, setConfirmDeleteMap] = React.useState(false);

  // Une carte disparue (supprimée ailleurs) laisserait l'onglet actif dans le
  // vide : on retombe alors sur la première.
  const activeMap = maps.find((m) => m.id === activeMapId) ?? maps[0] ?? null;
  const visiblePins = React.useMemo(
    () => pins.filter((p) => p.map_id === activeMap?.id),
    [pins, activeMap?.id],
  );
  const [loading, setLoading] = React.useState(!initialMap);
  const [editMode, setEditMode] = React.useState(false);

  const [selectedPin, setSelectedPin] = React.useState<MapPinType | null>(null);
  const [popoverPos, setPopoverPos] = React.useState<PinPopoverPos | null>(null);

  const [pendingPin, setPendingPin] = React.useState<PendingPin | null>(null);
  const [creatingPin, setCreatingPin] = React.useState(false);

  const [uploadingMap, setUploadingMap] = React.useState(false);
  const [imageLoaded, setImageLoaded] = React.useState(false);
  /** Palier de largeur affiché ; `null` désigne l'original. */
  const [widthTier, setWidthTier] = React.useState<number | null>(MAP_WIDTH_TIERS[0]);

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
  const activeMapRef = React.useRef<WorldMapData | null>(activeMap);
  activeMapRef.current = activeMap;
  const widthTierRef = React.useRef<number | null>(MAP_WIDTH_TIERS[0]);
  widthTierRef.current = widthTier;
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
   * Monte d'un palier quand la carte est affichée plus grande que le palier
   * courant. On ne redescend jamais : l'image plus fine est déjà téléchargée,
   * la reperdre au premier dézoom ne gagnerait rien et ferait clignoter.
   *
   * Le seuil est la taille RÉELLEMENT affichée, et non le simple fait d'avoir
   * zoomé : sur un téléphone, la vue par défaut tient largement dans le premier
   * palier, et l'original — jusqu'à 4096 px de large — n'a aucune raison d'être
   * téléchargé.
   */
  const requestWidthTier = React.useCallback((scale: number) => {
    const url = activeMapRef.current?.image_url;
    const courant = widthTierRef.current;
    // `null` est déjà le plus haut palier : rien au-dessus de l'original.
    if (!url || courant === null) return;

    const besoin = widthTierFor(baseSizeRef.current.width * scale, MAP_WIDTH_TIERS);
    if (besoin !== null && besoin <= courant) return;

    // Retenu tout de suite : sans quoi chaque cran de molette relancerait le
    // même préchargement.
    widthTierRef.current = besoin;
    const cible = besoin === null ? url : (supabaseThumb(url, besoin) ?? url);

    // Préchargée hors écran : l'échange de `src` se fait alors sur une image
    // déjà en cache, sans le blanc d'un rechargement.
    const preload = new window.Image();
    preload.onload = () => setWidthTier(besoin);
    preload.src = cible;
  }, []);

  const setTransform = React.useCallback(
    (next: MapTransform) => {
      if (next === transformRef.current) return;
      transformRef.current = next;
      requestWidthTier(next.scale);
      schedulePaint();
    },
    [requestWidthTier, schedulePaint],
  );

  // Retour à l'échelle 1 quand l'image change — et SEULEMENT alors.
  //
  // Les refs sont attachées avant que les effets ne s'exécutent : au montage,
  // l'image déjà en cache a donc livré ses dimensions et le cadre a été mesuré
  // AVANT que cet effet ne parte. Le laisser s'exécuter là effaçait cette
  // mesure, et la carte restait à zéro faute d'un second déclencheur.
  // La clé mêle la carte et son image : changer d'onglet remet la vue à plat,
  // et remplacer l'image d'une carte aussi.
  const viewKey = `${activeMap?.id ?? ""}:${activeMap?.image_url ?? ""}`;
  const lastViewKeyRef = React.useRef(viewKey);
  React.useEffect(() => {
    if (lastViewKeyRef.current === viewKey) return;
    lastViewKeyRef.current = viewKey;

    transformRef.current = IDENTITY;
    initialViewDoneRef.current = false;
    naturalRef.current = null;
    setBaseSize({ width: 0, height: 0 });
    widthTierRef.current = MAP_WIDTH_TIERS[0];
    setWidthTier(MAP_WIDTH_TIERS[0]);
    setImageLoaded(false);
    schedulePaint();
  }, [viewKey, schedulePaint]);

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
      requestWidthTier(transformRef.current.scale);
    }
    schedulePaint();
    syncPopoverPos();
  }, [baseSize.width, baseSize.height, bounds, requestWidthTier, schedulePaint, syncPopoverPos]);

  /**
   * Le cadre a changé de taille : fenêtre redimensionnée, tiroir latéral,
   * panneau des lieux ouvert ou fermé à sa gauche.
   *
   * On re-borne ICI plutôt que de s'en remettre à l'effet qui surveille la
   * taille ajustée de la carte, car celle-ci peut fort bien ne pas bouger : une
   * carte commandée par sa hauteur garde ses dimensions quand le cadre
   * s'élargit. L'effet ne se déclenche alors pas, et la carte resterait décalée
   * de la largeur gagnée — avec le panneau du lieu ouvert, planté à côté de son
   * épingle.
   */
  const handleFrameResized = React.useCallback(() => {
    measure();
    const b = bounds();
    if (b) {
      const { scale, x, y } = transformRef.current;
      transformRef.current = { scale, ...clampOffset(x, y, scale, b) };
    }
    schedulePaint();
    syncPopoverPos();
  }, [bounds, measure, schedulePaint, syncPopoverPos]);

  React.useEffect(() => {
    window.addEventListener("resize", handleFrameResized);
    return () => window.removeEventListener("resize", handleFrameResized);
  }, [handleFrameResized]);

  // ── Chargement initial ────────────────────────────────────────
  React.useEffect(() => {
    if (initialMap) return;
    let cancelled = false;
    (async () => {
      try {
        const { maps: m, pins: p } = await getWorldMaps(worldId);
        if (!cancelled) {
          setMaps(m);
          setActiveMapId((prev) => prev ?? initialMapId ?? m[0]?.id ?? null);
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
          { event: "*", schema: "public", table: "world_maps", filter: `world_id=eq.${worldId}` },
          (payload: RT) => {
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id: string }).id;
              setMaps((prev) => prev.filter((m) => m.id !== id));
              setPins((prev) => prev.filter((p) => p.map_id !== id));
              return;
            }
            const carte = payload.new as WorldMapData;
            setMaps((prev) =>
              prev.some((m) => m.id === carte.id)
                ? prev.map((m) => (m.id === carte.id ? carte : m))
                : [...prev, carte],
            );
          },
        )
        .subscribe(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, reconnectEpoch]);

  // ── Ce dont les panneaux ont besoin, chargé une fois pour tous ──
  //
  // Pages du wiki et salons situés : deux listes du monde entier, lues à la
  // première ouverture d'un lieu et partagées ensuite. Chaque panneau les
  // rechargeait pour lui-même, soit deux requêtes par clic sur une épingle.
  const [wikiPages, setWikiPages] = React.useState<WikiPageOption[]>([]);
  const [pinRooms, setPinRooms] = React.useState<PinRoom[]>([]);
  const popoverDataAskedRef = React.useRef(false);
  const loadPopoverData = React.useCallback(() => {
    if (popoverDataAskedRef.current) return;
    popoverDataAskedRef.current = true;
    void supabase
      .from("world_wiki_pages")
      .select("id, title, slug")
      .eq("world_id", worldId)
      .eq("is_folder", false)
      .is("deleted_at", null)
      .order("title")
      .then(({ data }: { data: WikiPageOption[] | null }) => setWikiPages(data ?? []));
    void supabase
      .from("chatrooms")
      .select("id, title, name, map_pin_id")
      .eq("world_id", worldId)
      .not("map_pin_id", "is", null)
      .then(({ data }: { data: PinRoom[] | null }) => setPinRooms(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  // Passer d'un monde à l'autre est une navigation client : ce composant n'est
  // pas remonté et ses états gardent la carte du monde quitté. Le chargement,
  // lui, ne repart plus quand le serveur a déjà fourni les données — d'où ce
  // resemis explicite.
  useResetOnKeyChange(worldId, () => {
    setMaps(initialMap?.maps ?? []);
    setActiveMapId(initialMap?.maps?.[0]?.id ?? null);
    setPins(initialMap?.pins ?? []);
    setLoading(!initialMap);
    setSelectedPin(null);
    setPopoverPos(null);
    setPendingPin(null);
    setEditMode(false);
    setWikiPages([]);
    setPinRooms([]);
    popoverDataAskedRef.current = false;
  });

  // ── Libellé de la carte ───────────────────────────────────────
  // La colonne `label` existait depuis la première migration sans que rien ne
  // l'écrive ni ne l'affiche : chaque monde avait donc « Carte » pour titre,
  // là où le wiki, lui, se laisse renommer.
  const mapLabel = activeMap?.label?.trim() || t("title");
  const [labelDraft, setLabelDraft] = React.useState(activeMap?.label ?? "");
  React.useEffect(() => { setLabelDraft(activeMap?.label ?? ""); }, [activeMap?.id, activeMap?.label]);

  /** Remplace une carte dans la liste, ou l'y ajoute si elle est nouvelle. */
  function mergeMap(prev: WorldMapData[], carte: WorldMapData): WorldMapData[] {
    return prev.some((m) => m.id === carte.id)
      ? prev.map((m) => (m.id === carte.id ? carte : m))
      : [...prev, carte];
  }

  async function handleLabelCommit() {
    const value = labelDraft.trim();
    if (!activeMap || value === (activeMap.label ?? "")) return;
    try {
      const updated = await updateWorldMap(activeMap.id, { label: value || t("title") });
      setMaps((prev) => mergeMap(prev, updated));
    } catch {
      toast.error(t("saveError"));
      setLabelDraft(activeMap.label ?? "");
    }
  }

  // ── Ajouter et supprimer une carte ────────────────────────────
  async function handleAddMap() {
    if (creatingMap) return;
    setCreatingMap(true);
    try {
      const carte = await createWorldMap(worldId, {
        label: t("newMapName"),
        sort_index: maps.length,
      });
      setMaps((prev) => mergeMap(prev, carte));
      // On bascule dessus : la nouvelle carte s'ouvre sur son état vide, où
      // l'on importe son image.
      setActiveMapId(carte.id);
      closePopover();
      setPendingPin(null);
    } catch {
      toast.error(t("createMapError"));
    } finally {
      setCreatingMap(false);
    }
  }

  async function handleReorderMaps(orderedIds: string[]) {
    const avant = maps;
    // Optimiste : les onglets suivent le doigt, sans attendre le serveur.
    const parId = new Map(avant.map((m) => [m.id, m]));
    const apres = orderedIds
      .map((id, index) => {
        const carte = parId.get(id);
        return carte ? { ...carte, sort_index: index } : null;
      })
      .filter((m): m is WorldMapData => m !== null);
    setMaps(apres);
    try {
      await reorderWorldMaps(orderedIds);
    } catch {
      toast.error(t("saveError"));
      setMaps(avant);
    }
  }

  async function handleDeleteMap() {
    if (!activeMap) return;
    const id = activeMap.id;
    try {
      await deleteWorldMap(id);
      setMaps((prev) => prev.filter((m) => m.id !== id));
      // Les épingles de la carte partent avec elle en base (`ON DELETE
      // CASCADE`) ; on les retire ici sans attendre l'écho du temps réel.
      setPins((prev) => prev.filter((p) => p.map_id !== id));
      setActiveMapId((prev) => (prev === id ? null : prev));
      closePopover();
      setPendingPin(null);
      toast.success(t("mapDeleted"));
    } catch {
      toast.error(t("deleteMapError"));
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

      // La carte d'abord, l'image ensuite : le fichier est rangé sous le
      // préfixe de SA carte, ce qui en fait l'unité de ménage. Un monde qui
      // n'avait aucune carte en reçoit une à l'occasion de sa première image.
      const carte = activeMap ?? (await createWorldMap(worldId, { label: t("title") }));
      const path = mapImagePath(worldId, carte.id, converted.type);

      const { error: upErr } = await supabase.storage
        .from("worlds")
        .upload(path, converted, { upsert: true, contentType: converted.type });
      if (upErr) throw upErr;

      const image_url = supabase.storage.from("worlds").getPublicUrl(path).data.publicUrl;
      const updated = await updateWorldMap(carte.id, { image_url });
      setMaps((prev) => mergeMap(prev, updated));
      setActiveMapId(updated.id);
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
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => handleFrameResized());
    observer?.observe(node);
    measure();

    wheelCleanupRef.current = () => {
      node.removeEventListener("wheel", onWheel);
      observer?.disconnect();
    };
  }, [bounds, handleFrameResized, measure, setTransform, syncPopoverPos]);

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

  /**
   * Écrit dans l'adresse la carte ouverte et le lieu consulté.
   *
   * Rien n'y était écrit : on ne pouvait pas partager ce qu'on avait sous les
   * yeux, et un rafraîchissement ramenait à la première carte du monde.
   *
   * `history` plutôt que le routeur de Next : changer un paramètre par
   * `router.push` refait un aller-retour serveur pour un état que le client
   * détient déjà.
   *
   * Changer de carte est une navigation — le bouton Précédent doit y ramener,
   * donc `push`. Ouvrir un lieu n'en est pas une : c'est un panneau posé
   * par-dessus, et lui donner une entrée d'historique par clic rendrait le
   * bouton Précédent inutilisable. D'où `replace`.
   */
  const writeUrl = React.useCallback(
    (mapId: string | null, pinId: string | null, mode: "push" | "replace") => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      url.searchParams.set("view", "map");
      if (mapId) url.searchParams.set("map", mapId);
      else url.searchParams.delete("map");
      if (pinId) url.searchParams.set("pin", pinId);
      else url.searchParams.delete("pin");
      window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url.toString());
    },
    [],
  );

  const closePopover = React.useCallback((refocusPin = false) => {
    const id = selectedPinRef.current?.id;
    setSelectedPin(null);
    setPopoverPos(null);
    if (id) writeUrl(activeMapRef.current?.id ?? null, null, "replace");
    // Fermé au clavier, le panneau renverrait sinon le focus au début du
    // document, et le lieu que l'on venait de lire serait à retrouver.
    if (refocusPin && id) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-pin-id="${id}"]`)?.focus();
      });
    }
  }, [writeUrl]);

  // Échap ferme le panneau ouvert. Le garde sur `defaultPrevented` laisse la
  // main aux boîtes de dialogue empilées par-dessus (apparence de l'épingle,
  // confirmation de suppression) : elles se ferment les premières.
  React.useEffect(() => {
    if (!selectedPin && !placesOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Un cran à la fois : le panneau d'un lieu d'abord, la liste ensuite.
      // Sur un téléphone, celle-ci recouvre la carte, et Échap est le geste
      // qu'on tente pour s'en défaire.
      if (selectedPin) closePopover(true);
      else setPlacesOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedPin, placesOpen, closePopover]);

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

  function openPopover(pin: MapPinType, writeHistory = true) {
    loadPopoverData();
    setSelectedPin(pin);
    setPopoverPos(popoverPosFor(pin));
    setPendingPin(null);
    if (writeHistory) writeUrl(pin.map_id, pin.id, "replace");
  }

  function selectMap(mapId: string, writeHistory = true) {
    setActiveMapId(mapId);
    closePopover();
    setPendingPin(null);
    if (writeHistory) writeUrl(mapId, null, "push");
  }

  /** Amène un lieu au centre du cadre, à échelle inchangée. */
  function centerOnPin(pin: MapPinType) {
    const b = bounds();
    if (!b) return;
    transformRef.current = centerOn(b, transformRef.current.scale, { x: pin.x, y: pin.y });
    schedulePaint();
  }

  /**
   * Va au lieu demandé — depuis la liste, ou depuis l'adresse.
   *
   * Sur une autre carte, le voyage se fait en deux temps : on bascule d'abord,
   * puis on centre quand la nouvelle carte est mesurée. Centrer tout de suite
   * se ferait sur les dimensions de la carte qu'on vient de quitter.
   */
  const pendingFocusRef = React.useRef<string | null>(initialPinId ?? null);
  function focusPin(pin: MapPinType) {
    if (pin.map_id !== activeMapRef.current?.id) {
      pendingFocusRef.current = pin.id;
      setActiveMapId(pin.map_id);
      closePopover();
      writeUrl(pin.map_id, pin.id, "push");
      return;
    }
    centerOnPin(pin);
    openPopover(pin);
  }

  React.useEffect(() => {
    const attendu = pendingFocusRef.current;
    if (!attendu || !baseSize.width) return;
    const pin = pins.find((p) => p.id === attendu);
    if (!pin) return;
    // Le lieu vit sur une autre carte — c'est le cas d'une adresse qui le
    // désigne directement : on bascule, et l'on repassera par ici une fois la
    // nouvelle carte mesurée.
    if (pin.map_id !== activeMap?.id) {
      setActiveMapId(pin.map_id);
      return;
    }
    pendingFocusRef.current = null;
    centerOnPin(pin);
    openPopover(pin, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSize.width, activeMap?.id, pins]);

  // Le bouton Précédent ramène à la carte, et au lieu, qu'on regardait.
  const pinsRef = React.useRef(pins);
  pinsRef.current = pins;
  React.useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const mapId = params.get("map");
      if (mapId) setActiveMapId(mapId);
      const pinId = params.get("pin");
      const pin = pinId ? pinsRef.current.find((p) => p.id === pinId) : null;
      if (pin) openPopover(pin, false);
      else closePopover();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreatePin() {
    if (!pendingPin || !pendingPin.title.trim() || creatingPin || !activeMap) return;
    setCreatingPin(true);
    try {
      const pin = await createMapPin(worldId, activeMap.id, pendingPin.x, pendingPin.y, pendingPin.title.trim());
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

  const imageSrc = activeMap?.image_url
    ? (widthTier === null
        ? activeMap.image_url
        : supabaseThumb(activeMap.image_url, widthTier) ?? activeMap.image_url)
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
          isEditMode && activeMap ? (
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
                  setLabelDraft(activeMap.label ?? "");
                  e.currentTarget.blur();
                }
              }}
              className="w-28 rounded-md border border-border-soft bg-background px-2 py-0.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary sm:w-40"
            />
          ) : (
            mapLabel
          )
        }
        right={
          canEdit && (
            <button
              type="button"
              aria-label={isEditMode ? t("editingActive") : tCommon("edit")}
              aria-pressed={isEditMode}
              onClick={(e) => { e.stopPropagation(); setEditMode((v) => !v); closePopover(); setPendingPin(null); }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium transition-colors sm:px-3",
                isEditMode
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border-soft bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Pencil className="h-3 w-3" />
              <span className="hidden sm:inline">
                {isEditMode ? t("editingActive") : tCommon("edit")}
              </span>
            </button>
          )
        }
      >
        {activeMap?.image_url && (
          <button
            type="button"
            aria-label={placesOpen ? t("hidePlaces") : t("showPlaces")}
            aria-pressed={placesOpen}
            onClick={(e) => { e.stopPropagation(); setPlacesOpen((v) => !v); }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              placesOpen
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <List className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("places")}</span>
          </button>
        )}
        {canEdit && isEditMode && activeMap?.image_url && (
          <button
            type="button"
            aria-label={t("changeMap")}
            onClick={(e) => { e.stopPropagation(); mapFileInputRef.current?.click(); }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {uploadingMap ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{t("changeMap")}</span>
          </button>
        )}
        {canEdit && isEditMode && activeMap && (
          <button
            type="button"
            aria-label={t("deleteMap")}
            onClick={(e) => { e.stopPropagation(); setConfirmDeleteMap(true); }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("deleteMap")}</span>
          </button>
        )}
      </WorldPanelHeader>

      {/* Onglets : cachés tant qu'il n'y a qu'une carte à montrer, pour lui
          laisser tout le cadre. En édition ils paraissent dès la première —
          c'est là qu'on en ajoute une deuxième. */}
      {(maps.length > 1 || (isEditMode && maps.length > 0)) && (
        <MapTabs
          maps={maps}
          activeId={activeMap?.id ?? null}
          isEditMode={isEditMode}
          creating={creatingMap}
          onSelect={(id) => selectMap(id)}
          onAdd={() => void handleAddMap()}
          onReorder={(ids) => void handleReorderMaps(ids)}
        />
      )}

      {/* ── Corps ──────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">

        {placesOpen && imageSrc && (
          <MapPlacesPanel
            maps={maps}
            pins={pins}
            activeMapId={activeMap?.id ?? null}
            selectedPinId={selectedPin?.id ?? null}
            onSelect={focusPin}
            onClose={() => setPlacesOpen(false)}
          />
        )}

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
            id={MAP_PANEL_ID}
            role={maps.length > 1 ? "tabpanel" : undefined}
            aria-labelledby={maps.length > 1 && activeMap ? mapTabId(activeMap.id) : undefined}
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

              {/* Pins existants — ceux de la carte affichée */}
              {visiblePins.map((pin) => (
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
          rooms={pinRooms.filter((r) => r.map_pin_id === selectedPin.id)}
          maps={maps}
          isEditMode={isEditMode}
          worldId={worldId}
          onClose={closePopover}
          onUpdated={(updated) => {
            setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setSelectedPin(updated);
          }}
          onDelete={() => void handleDeletePin(selectedPin)}
          onOpenMap={(mapId) => selectMap(mapId)}
        />
      )}

      {activeMap && (
        <DeleteConfirmDialog
          open={confirmDeleteMap}
          onOpenChange={setConfirmDeleteMap}
          title={t("deleteMapTitle", { label: mapLabel })}
          description={t("deleteMapDesc")}
          cancelLabel={tCommon("cancel")}
          confirmLabel={tCommon("delete")}
          onConfirm={() => { setConfirmDeleteMap(false); void handleDeleteMap(); }}
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
