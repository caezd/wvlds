"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { MEDIA, useMediaQuery } from "@/hooks/useMediaQuery";
import { useResetOnKeyChange } from "@/hooks/useResetOnKeyChange";
import { useMapViewport } from "@/hooks/useMapViewport";
// `Map` est renommée : l'icône masquait le `Map` natif.
import { Check, List, Loader2, Map as MapIcon, MapPin, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { channel } from "@/lib/constants";
import { openRealtimeChannel } from "@/lib/realtimeChannel";
import { toWebP } from "@/lib/imageUtils";
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

// Les pièces de l'interface d'un point — marqueur, panneau flottant, dialogue
// d'apparence, sélecteur de couleur — vivent à côté, comme les onglets et la
// liste des lieux. La vue elle-même (mesure, transformation, gestes, paliers
// d'image) est dans `useMapViewport`. Ce fichier ne garde que ce qui relie
// tout cela : les données, le temps réel, l'adresse, et l'assemblage.
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { MAP_PANEL_ID, MapTabs, mapTabId } from "./MapTabs";
import { MapPlacesDrawer, MapPlacesPanel } from "./MapPlacesPanel";
import { PinMarker } from "./PinMarker";
import { PinPopover } from "./PinPopover";
import { FLECHE, calcPopoverPos, pinAnchor } from "./popoverPosition";
import type { PinPopoverPos, PendingPin, PinRoom, WikiPageOption } from "./types";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";

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
  // Les rappels passés aux marqueurs doivent garder leur identité, et `t` n'y
  // est pour rien : rien ne garantit la sienne d'un rendu à l'autre — le mock
  // de test en rend d'ailleurs une neuve à chaque fois. Ils la lisent donc au
  // moment de s'en servir, sans en dépendre.
  const tRef = React.useRef(t);
  tRef.current = t;
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
  const [loading, setLoading] = React.useState(!initialMap);
  const [editMode, setEditMode] = React.useState(false);
  const isEditMode = canEdit && editMode;

  const [creatingMap, setCreatingMap] = React.useState(false);
  const [confirmDeleteMap, setConfirmDeleteMap] = React.useState(false);
  const [uploadingMap, setUploadingMap] = React.useState(false);

  const [placesOpen, setPlacesOpen] = React.useState(false);
  // La liste des lieux est une colonne quand la place le permet, un tiroir
  // sinon. C'est un MONTAGE différent et non un simple masquage : une classe
  // Tailwind laisserait les deux coques dans l'arbre, avec deux champs de
  // recherche pour un seul panneau.
  const grandEcran = useMediaQuery(MEDIA.lg);

  const [selectedPin, setSelectedPin] = React.useState<MapPinType | null>(null);
  const [popoverPos, setPopoverPos] = React.useState<PinPopoverPos | null>(null);
  const [pendingPin, setPendingPin] = React.useState<PendingPin | null>(null);
  const [creatingPin, setCreatingPin] = React.useState(false);

  const mapFileInputRef = React.useRef<HTMLInputElement>(null);
  const popoverPanelRef = React.useRef<HTMLDivElement | null>(null);

  // Une carte disparue (supprimée ailleurs) laisserait l'onglet actif dans le
  // vide : on retombe alors sur la première.
  const activeMap = maps.find((m) => m.id === activeMapId) ?? maps[0] ?? null;
  const visiblePins = React.useMemo(
    () => pins.filter((p) => p.map_id === activeMap?.id),
    [pins, activeMap?.id],
  );

  // Miroirs en ref de ce que les rappels stables doivent lire à jour : ils
  // gardent ainsi leur identité, et `React.memo` sur les marqueurs a un sens.
  const selectedPinRef = React.useRef<MapPinType | null>(null);
  selectedPinRef.current = selectedPin;
  const activeMapRef = React.useRef<WorldMapData | null>(activeMap);
  activeMapRef.current = activeMap;
  const pinsRef = React.useRef(pins);
  pinsRef.current = pins;

  // ── Le panneau d'un lieu suit son épingle ─────────────────────
  const viewport = useMapViewport({
    imageUrl: activeMap?.image_url ?? null,
    // La clé mêle la carte et son image : changer d'onglet remet la vue à
    // plat, et remplacer l'image d'une carte aussi.
    viewKey: `${activeMap?.id ?? ""}:${activeMap?.image_url ?? ""}`,
    idleCursor: isEditMode ? "crosshair" : "grab",
    onPaint: () => repositionPopoverPanel(),
    onSettle: () => syncPopoverPos(),
  });
  const { imageRef, baseSize, centerOnPoint } = viewport;

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
  }, [imageRef]);

  /**
   * Replace le panneau ouvert sur le DOM, dans la même image que la carte.
   *
   * Il était posé une fois pour toutes à l'endroit du clic, et le moindre
   * déplacement de la carte le laissait en plan, désigner un lieu qui n'était
   * plus là.
   */
  function repositionPopoverPanel() {
    const panel = popoverPanelRef.current;
    const pin = selectedPinRef.current;
    if (!panel || !pin) return;
    const pos = popoverPosFor(pin);
    if (!pos) return;
    panel.style.left = `${pos.left}px`;
    panel.style.top = `${pos.top}px`;
    const caret = panel.querySelector<HTMLElement>("[data-pin-caret]");
    if (caret) {
      caret.style.left = `${pos.arrowLeft - FLECHE / 2}px`;
      caret.dataset.placement = pos.placement;
    }
  }

  /**
   * Recopie dans l'état React la position que le geste vient d'écrire sur le
   * DOM. Sans ce rattrapage, le premier rendu venu — un survol, une mise à jour
   * temps réel — replacerait le panneau là où il était au début du geste.
   */
  const popoverSyncRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncPopoverPos = React.useCallback(() => {
    if (popoverSyncRef.current) clearTimeout(popoverSyncRef.current);
    popoverSyncRef.current = setTimeout(() => {
      const pin = selectedPinRef.current;
      if (!pin) return;
      const pos = popoverPosFor(pin);
      if (pos) setPopoverPos(pos);
    }, 120);
  }, [popoverPosFor]);

  React.useEffect(() => () => {
    if (popoverSyncRef.current) {
      clearTimeout(popoverSyncRef.current);
      popoverSyncRef.current = null;
    }
  }, []);

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
              setPins((prev) => mergeById(prev, payload.new as MapPinType));
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
            setMaps((prev) => mergeById(prev, payload.new as WorldMapData));
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

  // ── L'adresse suit ce qu'on regarde ───────────────────────────
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

  // ── Ouvrir et fermer le panneau d'un lieu ─────────────────────
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

  const openPopover = React.useCallback((pin: MapPinType, writeHistory = true) => {
    loadPopoverData();
    setSelectedPin(pin);
    setPopoverPos(popoverPosFor(pin));
    setPendingPin(null);
    if (writeHistory) writeUrl(pin.map_id, pin.id, "replace");
  }, [loadPopoverData, popoverPosFor, writeUrl]);

  const selectMap = React.useCallback((mapId: string | null, mode: "push" | "replace" = "push") => {
    setActiveMapId(mapId);
    closePopover();
    setPendingPin(null);
    writeUrl(mapId, null, mode);
  }, [closePopover, writeUrl]);

  // Échap ferme le panneau ouvert. Le garde sur `defaultPrevented` laisse la
  // main aux boîtes de dialogue empilées par-dessus (apparence de l'épingle,
  // confirmation de suppression) : elles se ferment les premières.
  React.useEffect(() => {
    if (!selectedPin && !placesOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Un cran à la fois : le panneau d'un lieu d'abord, la colonne ensuite.
      // Le tiroir, lui, s'en charge tout seul.
      if (selectedPin) closePopover(true);
      else if (grandEcran) setPlacesOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedPin, placesOpen, grandEcran, closePopover]);

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

  // ── Aller à un lieu ───────────────────────────────────────────
  /**
   * Va au lieu demandé — depuis la liste, ou depuis l'adresse.
   *
   * Sur une autre carte, le voyage se fait en deux temps : on bascule d'abord,
   * puis on centre quand la nouvelle carte est mesurée. Centrer tout de suite
   * se ferait sur les dimensions de la carte qu'on vient de quitter.
   */
  const pendingFocusRef = React.useRef<string | null>(initialPinId ?? null);
  const focusPin = React.useCallback((pin: MapPinType) => {
    if (pin.map_id !== activeMapRef.current?.id) {
      pendingFocusRef.current = pin.id;
      setActiveMapId(pin.map_id);
      closePopover();
      writeUrl(pin.map_id, pin.id, "push");
      return;
    }
    centerOnPoint({ x: pin.x, y: pin.y });
    openPopover(pin);
    // Le tiroir recouvre la carte : le refermer est le seul moyen de voir le
    // lieu qu'on vient de choisir.
    if (!grandEcran) setPlacesOpen(false);
  }, [centerOnPoint, closePopover, grandEcran, openPopover, writeUrl]);

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
    centerOnPoint({ x: pin.x, y: pin.y });
    openPopover(pin, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSize.width, activeMap?.id, pins]);

  // Le bouton Précédent ramène à la carte, et au lieu, qu'on regardait.
  //
  // L'écoute est posée une fois pour toutes, mais lit ses gestionnaires dans
  // une ref : ceux-ci changent avec le monde, et une fermeture figée au montage
  // rouvrirait les lieux du monde quitté.
  const historyHandlersRef = React.useRef({ openPopover, closePopover });
  historyHandlersRef.current = { openPopover, closePopover };
  React.useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const mapId = params.get("map");
      if (mapId) setActiveMapId(mapId);
      const pinId = params.get("pin");
      const pin = pinId ? pinsRef.current.find((p) => p.id === pinId) : null;
      if (pin) historyHandlersRef.current.openPopover(pin, false);
      else historyHandlersRef.current.closePopover();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
    pendingFocusRef.current = null;
  });

  // ── Libellé de la carte ───────────────────────────────────────
  // La colonne `label` existait depuis la première migration sans que rien ne
  // l'écrive ni ne l'affiche : chaque monde avait donc « Carte » pour titre,
  // là où le wiki, lui, se laisse renommer.
  const mapLabel = activeMap?.label?.trim() || t("title");
  const [labelDraft, setLabelDraft] = React.useState(activeMap?.label ?? "");
  React.useEffect(() => { setLabelDraft(activeMap?.label ?? ""); }, [activeMap?.id, activeMap?.label]);

  async function handleLabelCommit() {
    const value = labelDraft.trim();
    if (!activeMap || value === (activeMap.label ?? "")) return;
    try {
      const updated = await updateWorldMap(activeMap.id, { label: value || t("title") });
      setMaps((prev) => mergeById(prev, updated));
    } catch {
      toast.error(t("saveError"));
      setLabelDraft(activeMap.label ?? "");
    }
  }

  // ── Ajouter, réordonner, supprimer une carte ──────────────────
  async function handleAddMap() {
    if (creatingMap) return;
    setCreatingMap(true);
    try {
      const carte = await createWorldMap(worldId, {
        label: t("newMapName"),
        sort_index: maps.length,
      });
      setMaps((prev) => mergeById(prev, carte));
      // On bascule dessus : la nouvelle carte s'ouvre sur son état vide, où
      // l'on importe son image.
      selectMap(carte.id);
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
      const restantes = maps.filter((m) => m.id !== id);
      setMaps(restantes);
      // Les épingles de la carte partent avec elle en base (`ON DELETE
      // CASCADE`) ; on les retire ici sans attendre l'écho du temps réel.
      setPins((prev) => prev.filter((p) => p.map_id !== id));
      // `replace` : on ne revient pas en arrière vers une carte supprimée.
      selectMap(restantes[0]?.id ?? null, "replace");
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
      setMaps((prev) => mergeById(prev, updated));
      setActiveMapId(updated.id);
      toast.success(t("mapUpdated"));
    } catch {
      toast.error(t("uploadError"));
    } finally {
      setUploadingMap(false);
    }
  }

  // ── Les épingles ──────────────────────────────────────────────
  //
  // Ces trois gestionnaires reçoivent l'épingle en argument et gardent leur
  // identité d'un rendu à l'autre. C'est ce qui rend `React.memo` utile sur
  // `PinMarker` : avec une fermeture neuve par marqueur et par rendu, la
  // mémoïsation ne servait à rien — chaque changement d'état de la carte
  // re-rendait les N marqueurs, icône comprise.

  // ── Clic sur la carte (ajouter un pin si pas de drag) ────────
  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (viewport.consumeDidPan()) return;

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

  async function handleCreatePin() {
    if (!pendingPin || !pendingPin.title.trim() || creatingPin || !activeMap) return;
    setCreatingPin(true);
    try {
      const pin = await createMapPin(worldId, activeMap.id, pendingPin.x, pendingPin.y, pendingPin.title.trim());
      setPins((prev) => mergeById(prev, pin));
      setPendingPin(null);
      openPopover(pin);
    } catch {
      toast.error(t("createPinError"));
    } finally {
      setCreatingPin(false);
    }
  }

  const handlePinClick = React.useCallback((pin: MapPinType) => {
    if (selectedPinRef.current?.id === pin.id) {
      closePopover();
      return;
    }
    openPopover(pin);
  }, [closePopover, openPopover]);

  const handlePinMoved = React.useCallback(async (pin: MapPinType, x: number, y: number) => {
    // Optimiste : mise à jour locale immédiate
    const updated = { ...pin, x, y };
    setPins((prev) => prev.map((p) => (p.id === pin.id ? updated : p)));
    if (selectedPinRef.current?.id === pin.id) {
      setSelectedPin(updated);
      // Le panneau suit l'épingle qu'on vient de déplacer : le marqueur avale
      // ses propres événements de pointeur, la carte n'a donc rien vu passer.
      syncPopoverPos();
    }
    try {
      await updateMapPin(pin.id, { x, y });
    } catch {
      toast.error(tRef.current("movePinError"));
      // Rollback
      setPins((prev) => prev.map((p) => (p.id === pin.id ? pin : p)));
    }
  }, [syncPopoverPos]);

  const handleDeletePin = React.useCallback(async (pin: MapPinType) => {
    try {
      await deleteMapPin(pin.id);
      setPins((prev) => prev.filter((p) => p.id !== pin.id));
      if (selectedPinRef.current?.id === pin.id) closePopover();
      toast.success(tRef.current("pinDeleted"));
    } catch {
      toast.error(tRef.current("deletePinError"));
    }
  }, [closePopover]);

  // ── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { imageSrc } = viewport;

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

        {placesOpen && imageSrc && grandEcran && (
          <MapPlacesPanel
            maps={maps}
            pins={pins}
            activeMapId={activeMap?.id ?? null}
            selectedPinId={selectedPin?.id ?? null}
            onSelect={focusPin}
            onClose={() => setPlacesOpen(false)}
          />
        )}
        {imageSrc && !grandEcran && (
          <MapPlacesDrawer
            open={placesOpen}
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
            ref={viewport.containerCallbackRef}
            id={MAP_PANEL_ID}
            role={maps.length > 1 ? "tabpanel" : undefined}
            aria-labelledby={maps.length > 1 && activeMap ? mapTabId(activeMap.id) : undefined}
            // `touch-none` : sans lui, le navigateur s'attribue le geste pour
            // faire défiler la page, et le déplacement de la carte s'interrompt
            // au premier pixel. Le pincement à deux doigts en dépend aussi.
            className="relative flex-1 touch-none overflow-hidden select-none"
            {...viewport.pointerHandlers}
            onClick={handleContainerClick}
          >
            {/* Enveloppe pan+zoom — transform-origin top-left ; la transformation
                est écrite par le hook, pas par le rendu React. */}
            <div
              ref={viewport.wrapperRef}
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
                  de `coverSize`. `next/image` n'a rien à faire ici — l'image
                  est déjà servie à la bonne largeur par le stockage, et son
                  mode `fill` changerait ce dimensionnement.

                  Pas de vignette floutée en attendant, contrairement au reste de
                  l'application : les proportions de la carte ne sont pas connues
                  avant son chargement (rien en base), et un substitut aux
                  proportions approchées déplacerait les épingles de quelques
                  pourcents — elles sautilleraient à l'arrivée de l'image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={viewport.imageCallbackRef}
                src={imageSrc}
                alt={t("mapAlt")}
                draggable={false}
                onLoad={viewport.onImageLoad}
                className={cn(
                  "block h-full w-full select-none transition-opacity duration-300 motion-reduce:transition-none",
                  viewport.imageLoaded ? "opacity-100" : "opacity-0",
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
                  onPinClick={handlePinClick}
                  onDelete={handleDeletePin}
                  onMoved={handlePinMoved}
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

/**
 * Ajoute une ligne à la liste, ou remplace celle qui porte déjà son
 * identifiant. Sert aux épingles comme aux cartes : le temps réel renvoie à
 * l'auteur ce qu'il vient d'insérer, déjà présent à l'écran.
 */
function mergeById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item];
}
