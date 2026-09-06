"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { MEDIA, useMediaQuery } from "@/hooks/useMediaQuery";
import { useResetOnKeyChange } from "@/hooks/useResetOnKeyChange";
import { useMapViewport } from "@/hooks/useMapViewport";
// `Map` est renommée : l'icône masquait le `Map` natif.
import { Check, Clock, Hexagon, List, Loader2, Map as MapIcon, MapPin, Pencil, Plus, Ruler, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { channel, MAX_MAP_IMAGE_MB } from "@/lib/constants";
import { openRealtimeChannel } from "@/lib/realtimeChannel";
import { STORED_IMAGE_ACCEPT, isStorableImage, toWebP } from "@/lib/imageUtils";
import { mapImagePath } from "@/lib/storagePaths";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import {
  createMapPin,
  createWorldMap,
  deleteMapPin,
  deleteWorldMap,
  createMapRegion,
  updateMapRegion,
  deleteMapRegion,
  getMapPersona,
  getMyMapPersonas,
  getWorldMaps,
  setPersonaLocation,
  reorderWorldMaps,
  updateMapPin,
  updateWorldMap,
  type MapPersona,
  type MapRegion,
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
import { PinDetail } from "./PinDetail";
import { ScaleCalibrator } from "./ScaleCalibrator";
import { RegionLayer } from "./RegionLayer";
import { RegionPanel } from "./RegionPanel";
import { MIN_REGION_POINTS, dedupeConsecutive, pointInPolygon, polygonCentroid } from "./geometry";
import { ScaleBar } from "./ScaleBar";
import { type MapScale } from "./scale";
import type { Point } from "./zoom";
import { isWithinTimeline } from "@/lib/worldTimeline";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import type { PendingPin, PinRoom, WikiPageOption } from "./types";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";

/** Cartes et épingles résolues côté serveur, quand l'onglet est ouvert d'emblée. */
export type InitialWorldMap = {
  maps: WorldMapData[];
  pins: MapPinType[];
  personas: MapPersona[];
  regions: MapRegion[];
};

/** Les couleurs des régions, dans l'ordre où on les dessine. */
const REGION_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#ec4899", "#84cc16"];

/** Une même référence pour « personne » : les marqueurs sont mémoïsés par identité. */
const NOBODY: MapPersona[] = [];

// ── Main component ─────────────────────────────────────────────────

export function WorldMap({
  worldId,
  canEdit,
  canPost = false,
  initialMap,
  initialMapId,
  initialPinId,
  timelineConfig = null,
}: {
  worldId: string;
  canEdit: boolean;
  /** La chronologie du monde, s'il en a une : la carte affiche alors une époque. */
  timelineConfig?: WorldTimelineConfig | null;
  /** Peut ouvrir un salon — condition du bouton « Jouer ici » d'un lieu. */
  canPost?: boolean;
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
  // Les personas placés quelque part dans le monde, cartes confondues — et les
  // miens, placés ou non, pour les poser depuis un panneau.
  const [personas, setPersonas] = React.useState<MapPersona[]>(initialMap?.personas ?? []);
  // Les régions, cartes confondues ; celle qu'on regarde ; le tracé en cours
  // (`null` quand on ne dessine pas) ; et le polygone fermé qui attend son nom.
  const [regions, setRegions] = React.useState<MapRegion[]>(initialMap?.regions ?? []);
  const [selectedRegion, setSelectedRegion] = React.useState<MapRegion | null>(null);
  const [draft, setDraft] = React.useState<Point[] | null>(null);
  const [pendingRegion, setPendingRegion] = React.useState<{ points: Point[]; label: string } | null>(null);
  const [creatingRegion, setCreatingRegion] = React.useState(false);
  const drawing = draft !== null;
  // Lue par les gestionnaires mémoïsés des marqueurs, qui gardent leur
  // identité d'un rendu à l'autre.
  const drawingRef = React.useRef(false);
  drawingRef.current = drawing;
  const [myPersonas, setMyPersonas] = React.useState<MapPersona[]>([]);
  const [loading, setLoading] = React.useState(!initialMap);
  const [editMode, setEditMode] = React.useState(false);
  const isEditMode = canEdit && editMode;

  const [creatingMap, setCreatingMap] = React.useState(false);
  const [confirmDeleteMap, setConfirmDeleteMap] = React.useState(false);
  // L'épingle dont on demande la suppression, en attente de confirmation.
  const [pinToDelete, setPinToDelete] = React.useState<MapPinType | null>(null);
  const [uploadingMap, setUploadingMap] = React.useState(false);

  const [placesOpen, setPlacesOpen] = React.useState(false);
  // Le réglage de l'échelle : actif ou non, et le segment en cours — `b`
  // manque tant que le second point n'est pas posé. Une ref pour le clic sur
  // une épingle, qui garde son identité d'un rendu à l'autre.
  const [calibrating, setCalibrating] = React.useState(false);
  const calibratingRef = React.useRef(false);
  calibratingRef.current = calibrating;
  const [segment, setSegment] = React.useState<{ a: Point; b: Point | null } | null>(null);
  // L'échelle courante de la vue, relevée à la fin de chaque geste : la barre
  // d'échelle en dépend, et elle n'a pas à suivre le geste image par image.
  const [viewScale, setViewScale] = React.useState(1);

  // L'époque affichée : l'année courante du monde d'emblée, `null` pour tout
  // voir. Les lieux qui n'existent pas à cette date s'estompent.
  const [epoch, setEpoch] = React.useState<WorldTimelineDate | null>(() =>
    timelineConfig ? { year: timelineConfig.current_year, month: null, day: null } : null,
  );
  const outOfTime = React.useCallback(
    (pin: MapPinType) => !!epoch && !isWithinTimeline(epoch, pin.exists_from, pin.exists_until),
    [epoch],
  );
  // La liste des lieux est une colonne quand la place le permet, un tiroir
  // sinon. C'est un MONTAGE différent et non un simple masquage : une classe
  // Tailwind laisserait les deux coques dans l'arbre, avec deux champs de
  // recherche pour un seul panneau.
  const grandEcran = useMediaQuery(MEDIA.lg);

  const [selectedPin, setSelectedPin] = React.useState<MapPinType | null>(null);
  const [pendingPin, setPendingPin] = React.useState<PendingPin | null>(null);
  const [creatingPin, setCreatingPin] = React.useState(false);

  const mapFileInputRef = React.useRef<HTMLInputElement>(null);

  // Une carte disparue (supprimée ailleurs) laisserait l'onglet actif dans le
  // vide : on retombe alors sur la première.
  const activeMap = maps.find((m) => m.id === activeMapId) ?? maps[0] ?? null;
  const visiblePins = React.useMemo(
    () => pins.filter((p) => p.map_id === activeMap?.id),
    [pins, activeMap?.id],
  );
  // Par lieu, avec un tableau par lieu qui ne change que si ses occupants
  // changent : c'est ce que `React.memo` compare sur chaque marqueur.
  const visibleRegions = React.useMemo(
    () => regions.filter((r) => r.map_id === activeMap?.id),
    [regions, activeMap?.id],
  );
  const personasByPin = React.useMemo(() => {
    const parLieu = new Map<string, MapPersona[]>();
    for (const persona of personas) {
      if (!persona.map_pin_id) continue;
      const liste = parLieu.get(persona.map_pin_id) ?? [];
      liste.push(persona);
      parLieu.set(persona.map_pin_id, liste);
    }
    return parLieu;
  }, [personas]);

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
    onSettle: (tr) => setViewScale(tr.scale),
  });
  const { imageRef, baseSize, centerOnPoint } = viewport;




  // ── Chargement initial ────────────────────────────────────────
  React.useEffect(() => {
    if (initialMap) return;
    let cancelled = false;
    (async () => {
      try {
        const { maps: m, pins: p, personas: who, regions: r } = await getWorldMaps(worldId);
        if (!cancelled) {
          setMaps(m);
          setActiveMapId((prev) => prev ?? initialMapId ?? m[0]?.id ?? null);
          setPins(p);
          setPersonas(who);
          setRegions(r);
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
              setRegions((prev) => prev.filter((r) => r.map_id !== id));
              return;
            }
            setMaps((prev) => mergeById(prev, payload.new as WorldMapData));
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "world_map_regions", filter: `world_id=eq.${worldId}` },
          (payload: RT) => {
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id: string }).id;
              setRegions((prev) => prev.filter((r) => r.id !== id));
              setSelectedRegion((prev) => (prev?.id === id ? null : prev));
              return;
            }
            const region = payload.new as MapRegion;
            setRegions((prev) => mergeById(prev, region));
            setSelectedRegion((prev) => (prev?.id === region.id ? region : prev));
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "personas", filter: `world_id=eq.${worldId}` },
          (payload: RT) => {
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id: string }).id;
              setPersonas((prev) => prev.filter((p) => p.id !== id));
              return;
            }
            const row = payload.new as { id: string; map_pin_id: string | null; deleted_at: string | null; is_template: boolean };
            if (!row.map_pin_id || row.deleted_at || row.is_template) {
              setPersonas((prev) => prev.filter((p) => p.id !== row.id));
              return;
            }
            // L'écho ne porte pas le cadre de l'avatar : on relit le persona
            // plutôt que de le dessiner nu jusqu'au prochain rechargement.
            void getMapPersona(row.id).then((persona) => {
              if (persona) setPersonas((prev) => mergeById(prev, persona));
            });
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
    void getMyMapPersonas(worldId).then(setMyPersonas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  // De quoi remplir un panneau, préchargé dès que la carte est à l'écran
  // plutôt qu'au premier clic sur un lieu : ces listes arrivaient sinon APRÈS
  // l'ouverture, faisant grandir le panneau sous les yeux — et sauter sa
  // position, qui se calcule à partir de sa hauteur. Trois requêtes légères,
  // une seule fois par visite (voir le garde dans `loadPopoverData`).
  React.useEffect(() => {
    if (activeMap?.image_url) loadPopoverData();
  }, [activeMap?.image_url, loadPopoverData]);

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
    // La fiche vit dans la colonne : l'ouvrir, c'est ouvrir la colonne.
    setPlacesOpen(true);
    setPendingPin(null);
    if (writeHistory) writeUrl(pin.map_id, pin.id, "replace");
  }, [loadPopoverData, writeUrl]);

  const selectMap = React.useCallback((mapId: string | null, mode: "push" | "replace" = "push") => {
    setActiveMapId(mapId);
    closePopover();
    setPendingPin(null);
    setSegment(null);
    setSelectedRegion(null);
    setDraft(null);
    setPendingRegion(null);
    writeUrl(mapId, null, mode);
  }, [closePopover, writeUrl]);

  // Échap ferme le panneau ouvert. Le garde sur `defaultPrevented` laisse la
  // main aux boîtes de dialogue empilées par-dessus (apparence de l'épingle,
  // confirmation de suppression) : elles se ferment les premières.
  React.useEffect(() => {
    if (!selectedPin && !placesOpen && !calibrating && !drawing && !pendingRegion && !selectedRegion) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      // Entrée ferme le tracé en cours — sauf dans un champ, où elle valide.
      if (e.key === "Enter" && drawing && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        finishDraft();
        return;
      }
      // Défaire le dernier sommet plutôt que de tout reprendre : une erreur de
      // main ne doit pas coûter le tracé entier.
      if (e.key === "Backspace" && drawing && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setDraft((prev) => (prev && prev.length > 0 ? prev.slice(0, -1) : prev));
        return;
      }
      if (e.key !== "Escape") return;
      // Un cran à la fois : le panneau d'un lieu d'abord, puis le tracé ou
      // la région ouverte, puis le segment d'échelle, puis l'outil lui-même,
      // la colonne enfin. Le tiroir, lui, s'en charge tout seul.
      if (selectedPin) closePopover(true);
      else if (pendingRegion) setPendingRegion(null);
      else if (drawing) setDraft(null);
      else if (selectedRegion) setSelectedRegion(null);
      else if (calibrating) {
        if (segment) setSegment(null);
        else setCalibrating(false);
      }
      else if (grandEcran) setPlacesOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

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
    // La colonne — le tiroir, sur un écran étroit — passe de la liste à la
    // fiche du lieu. La refermer reviendrait à cacher ce qu'on vient de
    // demander à voir.
    openPopover(pin);
  }, [centerOnPoint, closePopover, openPopover, writeUrl]);

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
    setPendingPin(null);
    setEditMode(false);
    setWikiPages([]);
    setPinRooms([]);
    setPersonas(initialMap?.personas ?? []);
    setMyPersonas([]);
    setRegions(initialMap?.regions ?? []);
    setSelectedRegion(null);
    setDraft(null);
    setPendingRegion(null);
    setCalibrating(false);
    setSegment(null);
    popoverDataAskedRef.current = false;
    pendingFocusRef.current = null;
  });

  // ── Libellé de la carte ───────────────────────────────────────
  // La colonne `label` existait depuis la première migration sans que rien ne
  // l'écrive ni ne l'affiche : chaque monde avait donc « Carte » pour titre,
  // là où le wiki, lui, se laisse renommer.
  const mapLabel = activeMap?.label?.trim() || t("title");

  /** Renomme une carte depuis son onglet. Un nom vide retombe sur « Carte ». */
  async function handleRenameMap(mapId: string, label: string) {
    try {
      const updated = await updateWorldMap(mapId, { label: label || t("title") });
      setMaps((prev) => mergeById(prev, updated));
    } catch {
      toast.error(t("saveError"));
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
    if (!isStorableImage(file)) {
      toast.error(t("imageFormats"));
      return;
    }
    if (file.size > MAX_MAP_IMAGE_MB * 1024 * 1024) {
      toast.error(t("fileTooLarge", { max: MAX_MAP_IMAGE_MB }));
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
        .upload(path, converted, { contentType: converted.type });
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

  /** Le point cliqué, en pourcentages de la carte — `null` hors de l'image. */
  function pointOnImage(e: React.MouseEvent): Point | null {
    const img = imageRef.current;
    if (!img) return null;
    // Le rectangle mesuré tient compte de la transformation : le pourcentage se
    // lit directement, sans refaire le calcul du déplacement et de l'échelle.
    const r = img.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    if (!(x >= 0 && x <= 100 && y >= 0 && y <= 100)) return null;
    return { x, y };
  }

  /** Un sommet de plus au tracé en cours. */
  const addDraftPoint = React.useCallback((p: Point) => {
    setDraft((prev) => [...(prev ?? []), p]);
  }, []);

  /** Premier point, second point — puis un troisième recommence un segment. */
  const addScalePoint = React.useCallback((p: Point) => {
    setSegment((prev) => (prev && !prev.b ? { a: prev.a, b: p } : { a: p, b: null }));
  }, []);

  function toggleCalibrating() {
    setCalibrating((v) => !v);
    setSegment(null);
    setPendingPin(null);
    setDraft(null);
    setPendingRegion(null);
    closePopover();
  }

  /**
   * Entre en écriture, ou en sort — en rangeant les outils au passage.
   *
   * Le tracé d'une région survivait à la sortie : ses boutons disparaissaient
   * de l'en-tête, mais chaque clic sur la carte posait encore un sommet, sans
   * plus rien pour fermer le polygone ni l'abandonner.
   */
  function toggleEditMode() {
    setEditMode((v) => !v);
    closePopover();
    setPendingPin(null);
    setSelectedRegion(null);
    setDraft(null);
    setPendingRegion(null);
    setCalibrating(false);
    setSegment(null);
  }

  /** L'outil de tracé : on pose des sommets jusqu'à fermer, ou abandonner. */
  function toggleDrawing() {
    setDraft((prev) => (prev === null ? [] : null));
    setPendingRegion(null);
    setPendingPin(null);
    setSelectedRegion(null);
    setCalibrating(false);
    setSegment(null);
    closePopover();
  }

  /**
   * Ferme le tracé : un double-clic pose deux fois le même sommet, et une
   * main qui tremble en pose deux à un demi-pourcent — on les fond. En
   * dessous de trois sommets, ce n'est pas encore une région.
   */
  function finishDraft() {
    const points = dedupeConsecutive(draft ?? []);
    if (points.length < MIN_REGION_POINTS) {
      toast.error(t("minRegionPoints"));
      return;
    }
    setDraft(null);
    setPendingRegion({ points, label: "" });
  }

  async function handleCreateRegion() {
    if (!pendingRegion || !pendingRegion.label.trim() || creatingRegion || !activeMap) return;
    setCreatingRegion(true);
    try {
      const region = await createMapRegion(worldId, activeMap.id, {
        label: pendingRegion.label.trim(),
        points: pendingRegion.points,
        color: REGION_COLORS[visibleRegions.length % REGION_COLORS.length],
      });
      setRegions((prev) => mergeById(prev, region));
      setPendingRegion(null);
      setSelectedRegion(region);
    } catch {
      toast.error(t("createRegionError"));
    } finally {
      setCreatingRegion(false);
    }
  }

  function handleRegionClick(region: MapRegion) {
    if (viewport.consumeDidPan() || drawing || calibrating) return;
    closePopover();
    setPendingPin(null);
    loadPopoverData();
    setSelectedRegion((prev) => (prev?.id === region.id ? null : region));
  }

  /** Un sommet déplacé : la région suit tout de suite, le serveur ensuite. */
  async function handleVertexMoved(region: MapRegion, index: number, point: Point) {
    const points = region.points.map((p, i) => (i === index ? point : p));
    const updated = { ...region, points };
    setRegions((prev) => mergeById(prev, updated));
    setSelectedRegion((prev) => (prev?.id === region.id ? updated : prev));
    try {
      await updateMapRegion(region.id, { points });
    } catch {
      toast.error(t("saveError"));
      setRegions((prev) => mergeById(prev, region));
      setSelectedRegion((prev) => (prev?.id === region.id ? region : prev));
    }
  }

  async function handleDeleteRegion(region: MapRegion) {
    try {
      await deleteMapRegion(region.id);
      setRegions((prev) => prev.filter((r) => r.id !== region.id));
      setSelectedRegion(null);
      toast.success(t("regionDeleted"));
    } catch {
      toast.error(t("deleteRegionError"));
    }
  }

  // ── Clic sur la carte (mesurer, ou ajouter un pin si pas de drag) ────────
  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (viewport.consumeDidPan()) return;

    if (pendingPin) { setPendingPin(null); return; }
    if (pendingRegion) { setPendingRegion(null); return; }
    if (selectedPin) { closePopover(); return; }
    if (selectedRegion) { setSelectedRegion(null); return; }

    if (drawing) {
      const p = pointOnImage(e);
      if (p) addDraftPoint(p);
      return;
    }

    if (calibrating) {
      const p = pointOnImage(e);
      if (p) addScalePoint(p);
      return;
    }

    if (!isEditMode) return;
    const p = pointOnImage(e);
    if (p) setPendingPin({ ...p, title: "" });
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
    // L'outil d'échelle en main, un clic sur un lieu s'y accroche : la
    // distance connue va souvent d'un lieu à un autre. Un tracé de région en
    // cours fait de même, plutôt que d'ouvrir un panneau par-dessus lui.
    if (calibratingRef.current) {
      addScalePoint({ x: pin.x, y: pin.y });
      return;
    }
    if (drawingRef.current) {
      addDraftPoint({ x: pin.x, y: pin.y });
      return;
    }
    if (selectedPinRef.current?.id === pin.id) {
      closePopover();
      return;
    }
    openPopover(pin);
  }, [closePopover, openPopover, addScalePoint, addDraftPoint]);

  const handlePinMoved = React.useCallback(async (pin: MapPinType, x: number, y: number) => {
    // Optimiste : mise à jour locale immédiate
    const updated = { ...pin, x, y };
    setPins((prev) => prev.map((p) => (p.id === pin.id ? updated : p)));
    // La fiche montre le lieu déplacé : elle vit dans la colonne, à sa
    // place, et n'a plus à suivre l'épingle.
    if (selectedPinRef.current?.id === pin.id) setSelectedPin(updated);
    try {
      await updateMapPin(pin.id, { x, y });
    } catch {
      toast.error(tRef.current("movePinError"));
      // Rollback
      setPins((prev) => prev.map((p) => (p.id === pin.id ? pin : p)));
    }
  }, []);

  /**
   * Pose un de mes personas ici — ou l'en fait partir. Optimiste : la tête
   * apparaît sur le marqueur sans attendre le serveur, et l'écho temps réel
   * la confirmera avec son cadre.
   */
  async function handlePlacePersona(personaId: string, pinId: string | null) {
    const persona = myPersonas.find((p) => p.id === personaId);
    if (!persona) return;
    const avant = personas;
    const deplace = { ...persona, map_pin_id: pinId };
    setPersonas((prev) => (pinId ? mergeById(prev, deplace) : prev.filter((p) => p.id !== personaId)));
    setMyPersonas((prev) => prev.map((p) => (p.id === personaId ? deplace : p)));
    try {
      await setPersonaLocation(personaId, pinId);
      toast.success(t(pinId ? "personaPlaced" : "personaLeft", { name: persona.name }));
    } catch {
      toast.error(t("locationError"));
      setPersonas(avant);
      setMyPersonas((prev) => prev.map((p) => (p.id === personaId ? persona : p)));
    }
  }

  /** Règle l'échelle depuis une distance déclarée — `null` la retire. */
  async function handleCalibrate(widthUnits: number | null, unit: string) {
    if (!activeMap) return;
    try {
      const updated = await updateWorldMap(activeMap.id, {
        scale_width_units: widthUnits,
        scale_unit: widthUnits == null ? null : unit,
      });
      setMaps((prev) => mergeById(prev, updated));
      toast.success(t("scaleSaved"));
    } catch {
      toast.error(t("saveError"));
    }
  }

  /**
   * Demande la suppression d'un lieu — la confirmation vit ici, et non dans
   * les deux endroits d'où l'on peut la déclencher.
   *
   * La croix du marqueur supprimait sans rien demander : un lieu et sa
   * description disparaissaient sur un clic de trop, et rien ne les ramène.
   * Le panneau, lui, confirmait de son côté ; les deux chemins passent
   * désormais par le même dialogue.
   */
  const handleDeletePin = React.useCallback((pin: MapPinType) => {
    setPinToDelete(pin);
  }, []);

  async function confirmDeletePin() {
    const pin = pinToDelete;
    setPinToDelete(null);
    if (!pin) return;
    try {
      await deleteMapPin(pin.id);
      setPins((prev) => prev.filter((p) => p.id !== pin.id));
      if (selectedPinRef.current?.id === pin.id) closePopover();
      toast.success(tRef.current("pinDeleted"));
    } catch {
      toast.error(tRef.current("deletePinError"));
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

  /**
   * Refermer la colonne referme aussi la fiche qu'elle montrait.
   *
   * Sans cela, la rouvrir aurait rendu le lieu d'avant plutôt que la liste,
   * et l'adresse aurait gardé un lieu que plus personne ne voyait.
   */
  function fermerLaColonne() {
    setPlacesOpen(false);
    closePopover();
  }

  /**
   * La fiche du lieu ouvert — elle vit dans la colonne, avec la liste des
   * lieux, plutôt que posée sur la carte.
   */
  const ficheDuLieu = selectedPin ? (
    <PinDetail
      key={selectedPin.id}
      pin={selectedPin}
      wikiPages={wikiPages}
      rooms={pinRooms.filter((r) => r.map_pin_id === selectedPin.id)}
      maps={maps}
      personasHere={personasByPin.get(selectedPin.id) ?? NOBODY}
      myPersonas={myPersonas}
      timelineConfig={timelineConfig}
      ownMap={maps.find((m) => m.id === selectedPin.map_id) ?? null}
      // La première région qui se referme autour du lieu. Il peut y en avoir
      // plusieurs empilées : celle du dessus est celle qu'on voit.
      region={visibleRegions.find((r) => pointInPolygon(selectedPin, r.points)) ?? null}
      isEditMode={isEditMode}
      canPost={canPost}
      worldId={worldId}
      onUpdated={(updated) => {
        setPins((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setSelectedPin(updated);
      }}
      onDelete={() => void handleDeletePin(selectedPin)}
      onOpenMap={(mapId) => selectMap(mapId)}
      onPlacePersona={(personaId, pinId) => void handlePlacePersona(personaId, pinId)}
    />
  ) : null;

  const { imageSrc } = viewport;

  const mapScale: MapScale | null =
    activeMap?.scale_width_units != null && activeMap.scale_width_units > 0
      ? { widthUnits: activeMap.scale_width_units, unit: activeMap.scale_unit ?? "" }
      : null;
  // Hauteur sur largeur ; 1 tant que la carte n'est pas mesurée.
  const aspect = baseSize.width > 0 ? baseSize.height / baseSize.width : 1;

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      onClick={() => {
        if (pendingPin) setPendingPin(null);
        if (pendingRegion) setPendingRegion(null);
        if (selectedPin) closePopover();
        if (selectedRegion) setSelectedRegion(null);
      }}
    >
      <WorldPanelHeader
        icon={<MapIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={mapLabel}
        right={
          canEdit && (
            <button
              type="button"
              aria-label={isEditMode ? t("editingActive") : tCommon("edit")}
              aria-pressed={isEditMode}
              onClick={(e) => { e.stopPropagation(); toggleEditMode(); }}
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
        {timelineConfig && activeMap?.image_url && (
          <div
            className="flex items-center gap-1 rounded-md px-1 text-xs text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <input
              type="number"
              aria-label={t("epoch")}
              placeholder={timelineConfig.year_label}
              value={epoch?.year ?? ""}
              onChange={(e) => {
                const brut = e.target.value.trim();
                if (brut === "") { setEpoch(null); return; }
                const year = parseInt(brut, 10);
                if (!Number.isNaN(year)) setEpoch({ year, month: null, day: null });
              }}
              className="h-7 w-16 rounded-md border border-border-soft bg-background px-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              aria-label={t("allTimes")}
              aria-pressed={epoch === null}
              onClick={() => setEpoch(epoch ? null : { year: timelineConfig.current_year, month: null, day: null })}
              className={cn(
                "rounded-md px-1.5 py-1 transition-colors",
                epoch === null ? "bg-secondary text-foreground" : "hover:bg-secondary hover:text-foreground",
              )}
            >
              <span className="hidden sm:inline">{t("allTimes")}</span>
              <span className="sm:hidden">∞</span>
            </button>
          </div>
        )}
        {canEdit && isEditMode && activeMap?.image_url && (
          <button
            type="button"
            aria-label={t("setScale")}
            aria-pressed={calibrating}
            onClick={(e) => { e.stopPropagation(); toggleCalibrating(); }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              calibrating
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Ruler className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("setScale")}</span>
          </button>
        )}
        {activeMap?.image_url && (
          <button
            type="button"
            aria-label={placesOpen ? t("hidePlaces") : t("showPlaces")}
            aria-pressed={placesOpen}
            // Fermer par ce bouton ou par la croix de la colonne doit faire
            // la même chose : refermer la fiche avec elle.
            onClick={(e) => { e.stopPropagation(); if (placesOpen) fermerLaColonne(); else setPlacesOpen(true); }}
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
            aria-label={t("drawRegion")}
            aria-pressed={drawing}
            onClick={(e) => { e.stopPropagation(); toggleDrawing(); }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              drawing
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Hexagon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("drawRegion")}</span>
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
          actions={{
            onRename: (mapId, label) => void handleRenameMap(mapId, label),
            onChangeImage: () => mapFileInputRef.current?.click(),
            onDelete: () => setConfirmDeleteMap(true),
            uploading: uploadingMap,
          }}
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
            onClose={fermerLaColonne}
            detail={ficheDuLieu}
            onCloseDetail={() => closePopover(true)}
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
            onClose={fermerLaColonne}
            detail={ficheDuLieu}
            onCloseDetail={() => closePopover(true)}
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
            onDoubleClick={() => { if (drawing) finishDraft(); }}
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

              {/* Les régions, sous les épingles : une surface ne cache pas un point. */}
              {(visibleRegions.length > 0 || draft) && (
                <RegionLayer
                  regions={visibleRegions}
                  selectedId={selectedRegion?.id ?? null}
                  draft={draft}
                  isEditMode={isEditMode}
                  imgRef={imageRef}
                  onSelect={handleRegionClick}
                  onCloseDraft={finishDraft}
                  onVertexMoved={(region, index, point) => void handleVertexMoved(region, index, point)}
                />
              )}

              {/* Le polygone fermé attend son nom, au centre. */}
              {pendingRegion && (() => {
                const c = polygonCentroid(pendingRegion.points);
                return (
                  <div
                    className="absolute z-20"
                    style={{
                      left: `${c.x}%`,
                      top: `${c.y}%`,
                      transform: "translate(-50%, -50%) scale(var(--pin-inv-scale, 1))",
                      transformOrigin: "center center",
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-border bg-background px-2 py-1.5 shadow-xl">
                      <input
                        autoFocus
                        value={pendingRegion.label}
                        aria-label={t("regionName")}
                        placeholder={t("regionName")}
                        onChange={(e) => setPendingRegion({ ...pendingRegion, label: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleCreateRegion();
                          if (e.key === "Escape") setPendingRegion(null);
                        }}
                        className="w-40 rounded-md border border-border-soft bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        aria-label={tCommon("save")}
                        disabled={!pendingRegion.label.trim() || creatingRegion}
                        onClick={() => void handleCreateRegion()}
                        className="rounded p-1 text-primary hover:bg-primary/10 disabled:opacity-50"
                      >
                        {creatingRegion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        aria-label={tCommon("cancel")}
                        onClick={() => setPendingRegion(null)}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Pins existants — ceux de la carte affichée */}
              {visiblePins.map((pin) => (
                <PinMarker
                  key={pin.id}
                  pin={pin}
                  isSelected={selectedPin?.id === pin.id}
                  isEditMode={isEditMode}
                  imgRef={imageRef}
                  presentPersonas={personasByPin.get(pin.id) ?? NOBODY}
                  outOfTime={outOfTime(pin)}
                  onPinClick={handlePinClick}
                  onDelete={handleDeletePin}
                  onMoved={handlePinMoved}
                />
              ))}

              {/* Le segment d'échelle : dans l'enveloppe, il suit la carte. */}
              {segment && (
                <ScaleCalibrator
                  a={segment.a}
                  b={segment.b}
                  aspect={aspect}
                  scale={mapScale}
                  onCalibrate={(w, u) => void handleCalibrate(w, u)}
                  onClear={() => setSegment(null)}
                />
              )}

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

            {mapScale && baseSize.width > 0 && (
              <ScaleBar pxPerUnit={(baseSize.width * viewScale) / mapScale.widthUnits} unit={mapScale.unit} />
            )}

            {/* Indice d'aide en mode édition (sticky sur le container) */}
            {isEditMode && !pendingPin && !pendingRegion && (
              <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-xs text-white opacity-70">
                {!drawing
                  ? t("clickToAddPin")
                  : (draft?.length ?? 0) >= MIN_REGION_POINTS
                    ? t("drawingRegionClose")
                    : t("drawingRegionMore", { count: draft?.length ?? 0, min: MIN_REGION_POINTS })}
              </div>
            )}

            {/* Le panneau d'une région, dans le coin du cadre */}
            {selectedRegion && !drawing && (
              <RegionPanel
                region={selectedRegion}
                wikiPages={wikiPages}
                isEditMode={isEditMode}
                worldId={worldId}
                onClose={() => setSelectedRegion(null)}
                onUpdated={(region) => {
                  setRegions((prev) => mergeById(prev, region));
                  setSelectedRegion(region);
                }}
                onDelete={(region) => void handleDeleteRegion(region)}
              />
            )}
          </div>
        )}
      </div>

      <DeleteConfirmDialog
        open={pinToDelete !== null}
        onOpenChange={(ouvert) => { if (!ouvert) setPinToDelete(null); }}
        title={t("deleteTitle", { title: pinToDelete?.title ?? "" })}
        description={t("deleteDesc")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        onConfirm={() => void confirmDeletePin()}
      />


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
        accept={STORED_IMAGE_ACCEPT}
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
