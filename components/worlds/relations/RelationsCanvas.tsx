"use client";

import * as React from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleDashed, Crosshair, Minus, MousePointerClick, Plus, Shrink, Waypoints, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { isRetiredStatus } from "@/lib/personaStatus";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

// Le canevas orchestre : il tient l'état (vue, sélection, survols, filtres,
// recherche) et le distribue. Les données et leurs écritures sont dans
// `useRelationsData`, le dessin dans `RingView` (vue Cercle) et `FocusView`
// (vue Centré), la géométrie dans `geometry`, le zoom dans
// `useCanvasPanZoom`, le panneau de droite dans `RelationsSidePanel`, et la
// liste mobile dans `PersonaCard` / `PersonaRelationsPanel`.
import type { CPersona, CRelType, CRelation } from "./types";
import { RING_R, mergeEdges, polar, ringLayout, type Edge } from "./geometry";
import { useCanvasPanZoom } from "./useCanvasPanZoom";
import { BUTTON_FACTOR } from "./panZoom";
import { useRelationsData } from "./useRelationsData";
import { PersonaRelationsPanel, FALLBACK_TYPE } from "./PersonaRelationsPanel";
import { PersonaCard } from "./PersonaCard";
import { RelationDialog } from "./RelationDialog";
import { RelationsLegend, TypeStroke } from "./RelationsLegend";
import { RelationsSearch } from "./RelationsSearch";
import { RelationsSidePanel } from "./RelationsSidePanel";
import { DENSE_FROM, RingView } from "./RingView";
import { FocusView } from "./FocusView";
import type { PlateInteractions } from "./PlateParts";
import { groupIdOfKey, parseGroupBy, ringArcsInput, type RingGroupBy } from "./ringGrouping";
import { ViewOptions } from "./ViewOptions";

type View = "ring" | "focus";

const VIEWS: ReadonlyArray<[View, "viewRing" | "viewOrbit", LucideIcon]> = [
  ["ring", "viewRing", CircleDashed],
  ["focus", "viewOrbit", Crosshair],
];

/** Une vue retenue ; les anciennes valeurs (Réseau, Orbite) retombent sur les nouvelles. */
function parseView(value: unknown): View | null {
  if (value === "ring" || value === "network") return "ring";
  if (value === "focus" || value === "orbit") return "focus";
  return null;
}

/** La bulle qui suit la souris sur un lien. */
type EdgeTip = { x: number; y: number; from: string; to: string; directed: boolean; text: string; type: CRelType };

export type RelationsCanvasProps = {
  worldId: string;
  userId: string;
  canAdmin: boolean;
};

export function RelationsCanvas({ worldId, userId, canAdmin }: RelationsCanvasProps) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("personas.narrativeStatus");
  const data = useRelationsData(worldId, userId, canAdmin);
  const {
    loading, personas, members, groups, relTypes, groupByPersona, relations,
    personaMap, relTypeMap, myPersonaIds, userList, canEditFrom,
  } = data;
  const fallback: CRelType = React.useMemo(() => ({ ...FALLBACK_TYPE, name: t("unknown") }), [t]);
  const typeOf = React.useCallback((id: string) => relTypeMap.get(id) ?? fallback, [relTypeMap, fallback]);
  const statusOf = React.useCallback((p: CPersona) => tStatus(p.narrative_status ?? "alive"), [tStatus]);

  // ── Sélection ──
  // `?persona=` : la fiche d'un persona mène ici, sur lui.
  const searchParams = useSearchParams();
  const requestedPersona = searchParams?.get("persona") ?? null;
  const [selectedPersonaId, setSelectedPersonaId] = React.useState<string | null>(requestedPersona);
  React.useEffect(() => { if (requestedPersona) setSelectedPersonaId(requestedPersona); }, [requestedPersona]);
  const selectedPersona = selectedPersonaId ? personaMap.get(selectedPersonaId) ?? null : null;
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);

  // ── Survols ──
  const [hoverPersonaId, setHoverPersonaId] = React.useState<string | null>(null);
  const [hoverUserId, setHoverUserId] = React.useState<string | null>(null);
  const [hoverRelationId, setHoverRelationId] = React.useState<string | null>(null);
  const [tip, setTip] = React.useState<EdgeTip | null>(null);

  // ── Dialogue de création et de modification ──
  const [dialog, setDialog] = React.useState<{ from: CPersona; existing?: { rel: CRelation; to: CPersona } } | null>(null);
  function openCreate(from: CPersona) { setDialog({ from }); }
  function openEdit(rel: CRelation) {
    const from = personaMap.get(rel.from_persona_id);
    const to = personaMap.get(rel.to_persona_id);
    if (from && to) setDialog({ from, existing: { rel, to } });
  }

  // ── Filtres ──
  // Types : le panneau (grand écran) et la légende (mobile). Groupes et
  // retirés : la légende mobile seulement.
  const [hiddenTypes, setHiddenTypes] = React.useState<ReadonlySet<string>>(() => new Set());
  const [hiddenGroups, setHiddenGroups] = React.useState<ReadonlySet<string>>(() => new Set());
  const [hideRetired, setHideRetired] = React.useState(false);
  const toggle = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };
  const personaHidden = React.useCallback((pid: string) => {
    const gid = groupByPersona.get(pid);
    if (!!gid && hiddenGroups.has(gid)) return true;
    return hideRetired && isRetiredStatus(personaMap.get(pid)?.narrative_status);
  }, [groupByPersona, hiddenGroups, hideRetired, personaMap]);
  const hasRetired = React.useMemo(() => personas.some((p) => isRetiredStatus(p.narrative_status)), [personas]);
  const relationVisible = React.useCallback(
    (r: CRelation) => !hiddenTypes.has(r.type) && !personaHidden(r.from_persona_id) && !personaHidden(r.to_persona_id),
    [hiddenTypes, personaHidden],
  );

  // ── Recherche (en-tête) : filtre la liste mobile, estompe le plateau ──
  const [search, setSearch] = React.useState("");
  const query = search.trim().toLowerCase();

  const handleOf = React.useCallback((uid: string): string => {
    const m = members.find((mm) => mm.user_id === uid);
    return m?.username ? `@${m.username}` : uid.slice(0, 8);
  }, [members]);
  /** Un persona correspond si son nom OU le pseudo de son joueur matche. */
  const matchesSearch = React.useCallback(
    (p: CPersona) => !query || p.name.toLowerCase().includes(query) || handleOf(p.user_id).toLowerCase().includes(query),
    [query, handleOf],
  );
  /** Liste mobile filtrée : un pseudo qui matche garde tous ses personas. */
  const filteredUserList = React.useMemo(() => {
    if (!query) return userList;
    return userList
      .map(({ member, ps }) => {
        const ownerMatches = handleOf(member.user_id).toLowerCase().includes(query);
        return { member, ps: ownerMatches ? ps : ps.filter((p) => p.name.toLowerCase().includes(query)) };
      })
      .filter(({ ps }) => ps.length > 0);
  }, [userList, query, handleOf]);
  const searchResults = React.useMemo(
    () => (query ? personas.filter((p) => !personaHidden(p.id) && matchesSearch(p)) : []),
    [personas, query, personaHidden, matchesSearch],
  );

  // ── Demandes qui m'attendent : une pastille dans l'en-tête ──
  const pendingForMe = React.useMemo(
    () => relations.filter((r) => r.status === "pending" && myPersonaIds.has(r.to_persona_id)),
    [relations, myPersonaIds],
  );
  const pendingByPersona = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of pendingForMe) m.set(r.to_persona_id, (m.get(r.to_persona_id) ?? 0) + 1);
    return m;
  }, [pendingForMe]);
  /** Relations par persona (un miroir accepté ne compte qu'une fois). */
  const countsByPersona = React.useMemo(() => {
    const counts = new Map<string, { total: number; pending: number }>();
    const acceptedKeys = new Set(relations.filter((r) => r.status === "accepted").map((r) => `${r.from_persona_id}|${r.to_persona_id}|${r.type}`));
    const bump = (pid: string, pending: boolean) => {
      const c = counts.get(pid) ?? { total: 0, pending: 0 };
      c.total++;
      if (pending) c.pending++;
      counts.set(pid, c);
    };
    for (const r of relations) {
      const mirrored = r.status === "accepted" && acceptedKeys.has(`${r.to_persona_id}|${r.from_persona_id}|${r.type}`);
      // Un miroir : chaque bout ne compte que la relation qu'il émet.
      bump(r.from_persona_id, false);
      if (!mirrored) bump(r.to_persona_id, r.status === "pending");
    }
    return counts;
  }, [relations]);
  const relationCountOf = React.useCallback((pid: string) => countsByPersona.get(pid)?.total ?? 0, [countsByPersona]);
  /** Relations par type (un miroir réciproque ne compte qu'une fois). */
  const typeCounts = React.useMemo(() => {
    const accepted = new Set(relations.filter((r) => r.status === "accepted").map((r) => `${r.from_persona_id}|${r.to_persona_id}|${r.type}`));
    const m = new Map<string, number>();
    for (const r of relations) {
      const mirrored = r.status === "accepted" && accepted.has(`${r.to_persona_id}|${r.from_persona_id}|${r.type}`);
      if (mirrored && r.from_persona_id > r.to_persona_id) continue;
      m.set(r.type, (m.get(r.type) ?? 0) + 1);
    }
    return m;
  }, [relations]);

  // ── Couleur de groupe ──
  const groupColor = React.useMemo(() => {
    const m = new Map<string, string>();
    const gMap = new Map(groups.map((g) => [g.id, g.color]));
    for (const [pid, gid] of groupByPersona) {
      const c = gMap.get(gid);
      if (c) m.set(pid, c);
    }
    return m;
  }, [groupByPersona, groups]);
  const groupColorOf = React.useCallback((pid: string) => groupColor.get(pid), [groupColor]);

  // ── Vue et réglages d'affichage : retenus par monde, dans ce navigateur ──
  const [view, setView] = React.useState<View>("ring");
  // Découpage de la couronne (et des îlots) : par joueur ou par groupe.
  const [groupBy, setGroupBy] = React.useState<RingGroupBy>("player");
  const [hideIsolated, setHideIsolated] = React.useState(false);
  const [showSecondRing, setShowSecondRing] = React.useState(true);
  const storageKey = `wvlds:relations:${worldId}`;
  const [prefsLoaded, setPrefsLoaded] = React.useState(false);
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as
        { view?: unknown; groupBy?: unknown; hideIsolated?: unknown; secondRing?: unknown } | null;
      const v = parseView(saved?.view);
      if (v) setView(v);
      const g = parseGroupBy(saved?.groupBy);
      if (g) setGroupBy(g);
      if (typeof saved?.hideIsolated === "boolean") setHideIsolated(saved.hideIsolated);
      if (typeof saved?.secondRing === "boolean") setShowSecondRing(saved.secondRing);
    } catch { /* stockage indisponible : les réglages par défaut suffisent */ }
    setPrefsLoaded(true);
  }, [storageKey]);
  React.useEffect(() => {
    // Pas avant la lecture : on écraserait la préférence par la valeur par défaut.
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ view, groupBy, hideIsolated, secondRing: showSecondRing }));
    } catch { /* idem */ }
  }, [prefsLoaded, storageKey, view, groupBy, hideIsolated, showSecondRing]);
  const focusMode = view === "focus";
  // Sans groupe défini, « par groupe » n'a rien à montrer : on reste par joueur.
  const effectiveGroupBy: RingGroupBy = groups.length > 0 ? groupBy : "player";

  // ── Placement ──
  const visibleRelations = React.useMemo(() => relations.filter(relationVisible), [relations, relationVisible]);
  const edges = React.useMemo(() => mergeEdges(visibleRelations, relTypeMap), [visibleRelations, relTypeMap]);
  const typeOrder = React.useMemo(() => new Map(relTypes.map((tp, i) => [tp.id, i])), [relTypes]);
  /** Personas qui ont au moins un lien visible. */
  const connected = React.useMemo(() => {
    const ids = new Set<string>();
    for (const e of edges) { ids.add(e.from); ids.add(e.to); }
    return ids;
  }, [edges]);
  const ring = React.useMemo(
    () => ringLayout(ringArcsInput(
      effectiveGroupBy, userList, groups, groupByPersona,
      (id) => !personaHidden(id) && (!hideIsolated || connected.has(id)),
    )),
    [effectiveGroupBy, userList, groups, groupByPersona, personaHidden, hideIsolated, connected],
  );
  const groupArcs = React.useMemo(() => {
    if (effectiveGroupBy !== "group") return undefined;
    const byId = new Map(groups.map((g) => [g.id, g]));
    return {
      labelOf: (key: string) => {
        const gid = groupIdOfKey(key);
        return gid ? byId.get(gid)?.name ?? t("noGroup") : t("noGroup");
      },
      colorOf: (key: string) => {
        const gid = groupIdOfKey(key);
        return gid ? byId.get(gid)?.color : undefined;
      },
    };
  }, [effectiveGroupBy, groups, t]);
  const dense = ring.angles.size >= DENSE_FROM;

  /** Le persona par défaut de la vue Centré : le premier des miens, sinon le premier tout court. */
  const defaultFocus = React.useCallback((ownerId?: string | null) => {
    const usable = personas.filter((p) => !personaHidden(p.id));
    return (usable.find((p) => p.user_id === (ownerId ?? userId)) ?? usable.find((p) => p.user_id === userId) ?? usable[0])?.id ?? null;
  }, [personas, personaHidden, userId]);
  const focusId = selectedPersonaId && personaMap.has(selectedPersonaId) && !personaHidden(selectedPersonaId)
    ? selectedPersonaId
    : defaultFocus();

  // ── Déplacement, zoom ──
  const { zoom, pan, animating, dragging, viewportRef, wasDragged, zoomBy, zoomIn, zoomOut, focusOn, reset, pointerHandlers } = useCanvasPanZoom();

  // ── Gestes ──
  function clearHover() {
    setHoverPersonaId(null);
    setHoverRelationId(null);
    setTip(null);
  }
  /** Ouvre un persona (recherche, demande, ligne du panneau). */
  function openPersona(pid: string) {
    setSelectedPersonaId(pid);
    if (selectedUserId && personaMap.get(pid)?.user_id !== selectedUserId) setSelectedUserId(null);
    clearHover();
  }
  /** Clic sur un persona du cercle : il se choisit, ou se libère. Dense, on s'approche. */
  function activatePersona(pid: string, angle: number) {
    const was = selectedPersonaId === pid;
    setSelectedPersonaId(was ? null : pid);
    if (selectedUserId && personaMap.get(pid)?.user_id !== selectedUserId) setSelectedUserId(null);
    if (!was && dense && zoom < 1.6) focusOn(polar(angle, RING_R * 0.95), 2.4);
  }
  /** Clic sur un joueur (arc ou ligne du panneau). Dense, on s'approche de son arc. */
  function activatePlayer(uid: string) {
    const was = selectedUserId === uid && !selectedPersonaId;
    setSelectedUserId(was ? null : uid);
    setSelectedPersonaId(null);
    const arc = ring.arcs.find((a) => a.userId === uid);
    if (!was && dense && !focusMode && arc) {
      focusOn(polar(arc.mid, RING_R * 0.95), Math.min(4, Math.max(2, 48 / (arc.a1 - arc.a0))));
    }
  }
  function switchView(next: View) {
    if (next === view) return;
    if (next === "focus") {
      setSelectedPersonaId(selectedPersonaId ?? (selectedUserId ? defaultFocus(selectedUserId) : defaultFocus()));
    }
    clearHover();
    setHoverUserId(null);
    setView(next);
    reset(false);
  }
  /** Double-clic sur un persona du cercle : la vue Centré sur lui. */
  function openFocus(pid: string) {
    setSelectedPersonaId(pid);
    clearHover();
    setView("focus");
    reset(false);
  }
  function clearSelection() {
    setSelectedPersonaId(null);
    setSelectedUserId(null);
  }
  /** Fermer : en vue Centré, on revient au cercle. */
  function closePanel() {
    clearSelection();
    if (focusMode) switchView("ring");
  }
  function onEdgeHover(edge: Edge, e: React.MouseEvent | null) {
    if (!e) { setHoverRelationId(null); setTip(null); return; }
    setHoverRelationId(edge.rels[0].id);
    const rect = viewportRef.current?.getBoundingClientRect();
    const meta = typeOf(edge.type);
    setTip({
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
      from: personaMap.get(edge.from)?.name ?? "",
      to: personaMap.get(edge.to)?.name ?? "",
      directed: edge.directed,
      text: edge.pending ? `${meta.name} · ${t("pending")}` : meta.name,
      type: meta,
    });
  }

  // ── Raccourcis clavier ──
  // Lus depuis une ref : l'écouteur est posé une fois, l'état change sans cesse.
  const shortcuts = React.useRef({ dialogOpen: false, zoomBy, reset, clearSelection });
  shortcuts.current = { dialogOpen: !!dialog, zoomBy, reset, clearSelection };
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Une touche déjà traitée (menu, dialogue), une combinaison, une saisie : rien.
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.isContentEditable)) return;
      const s = shortcuts.current;
      if (s.dialogOpen) return;
      if (e.key === "Escape") s.clearSelection();
      else if (e.key === "f" || e.key === "F") s.reset();
      else if (e.key === "+" || e.key === "=") s.zoomBy(BUTTON_FACTOR);
      else if (e.key === "-") s.zoomBy(1 / BUTTON_FACTOR);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Ce que la vue Cercle pose au centre ──
  let center: { title: string; sub: string } | null = null;
  const hovered = hoverPersonaId ? personaMap.get(hoverPersonaId) : undefined;
  if (hovered && !selectedPersona) {
    center = { title: hovered.name, sub: `${handleOf(hovered.user_id)} · ${t("relationCount", { count: relationCountOf(hovered.id) })}` };
  } else if (selectedPersona) {
    center = { title: selectedPersona.name, sub: t("relationCount", { count: relationCountOf(selectedPersona.id) }) };
  } else if (selectedUserId) {
    center = { title: handleOf(selectedUserId), sub: t("personaCount", { count: ring.arcs.find((a) => a.userId === selectedUserId)?.personaIds.length ?? 0 }) };
  }

  const ix: PlateInteractions = {
    zoom,
    query,
    matches: matchesSearch,
    hoverPersonaId,
    hoverUserId,
    hoverRelationId,
    selectedPersonaId,
    selectedUserId,
    groupColorOf,
    typeOf,
    handleOf,
    onHoverPersona: setHoverPersonaId,
    onHoverUser: setHoverUserId,
    onEdgeHover,
    wasDragged,
  };

  // Le panneau : en vue Centré, toujours la fiche du persona central.
  const panelPersona = focusMode ? (focusId ? personaMap.get(focusId) ?? null : null) : selectedPersona;

  const panelProps = selectedPersona ? {
    persona: selectedPersona,
    owner: members.find((m) => m.user_id === selectedPersona.user_id),
    relations, personaMap, relTypeMap, userId, canAdmin,
    onAdd: canEditFrom(selectedPersona.id) ? () => openCreate(selectedPersona) : undefined,
    onEdit: openEdit,
    onUpdateDesc: (id: string, desc: string) => void data.updateRelation(id, { description: desc || null }),
    onDelete: (id: string) => void data.deleteRelation(id),
    onAccept: (id: string) => void data.acceptRelation(id),
  } : null;

  return (
    <div className="flex h-full w-full flex-col">
      <WorldPanelHeader
        icon={<Waypoints className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("title")}
        right={
          <>
            {pendingForMe.length > 0 && (
              <button
                type="button"
                onClick={() => openPersona(pendingForMe[0].to_persona_id)}
                className="flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-accent-soft px-2.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
                {t("pendingCount", { count: pendingForMe.length })}
              </button>
            )}
            <div role="radiogroup" aria-label={t("viewSwitch")} className="hidden h-9 shrink-0 items-center gap-0.5 rounded-md border border-input p-0.5 lg:flex">
              {VIEWS.map(([id, key, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={view === id}
                  onClick={() => switchView(id)}
                  className={cn(
                    "flex h-full items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    view === id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {t(key)}
                </button>
              ))}
            </div>
            <RelationsSearch
              value={search}
              onChange={setSearch}
              results={searchResults}
              handleOf={handleOf}
              groupColorOf={groupColorOf}
              onOpen={(pid) => { openPersona(pid); setSearch(""); }}
            />
          </>
        }
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* ── Grand écran : le plateau et son panneau ── */}
        <div className="hidden min-h-0 flex-1 lg:flex">
          <div
            ref={viewportRef}
            data-testid="relations-canvas"
            className="relative min-w-0 flex-1 select-none overflow-hidden p-2"
            style={{
              containerType: "size",
              cursor: dragging ? "grabbing" : "grab",
              touchAction: "none",
              background: "radial-gradient(circle at 50% 50%, var(--background) 0%, color-mix(in oklab, var(--background) 55%, var(--canvas)) 60%)",
            }}
            {...pointerHandlers}
            onClick={(e) => {
              // Un clic sur le fond, en vue Cercle, désélectionne ; pas la fin d'un glisser.
              if (e.target === e.currentTarget && !wasDragged() && !focusMode) clearSelection();
            }}
          >
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{tCommon("loading")}</div>
            ) : personas.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("noPersonas")}</div>
            ) : (
              // Le plateau : un carré qui change de taille réelle avec le zoom
              // (le texte reste net), déplacé depuis le centre de la fenêtre.
              <div
                data-relations-plate
                className="absolute left-1/2 top-1/2 aspect-square"
                style={{
                  width: `calc(min(100cqw, 100cqh) * ${zoom.toFixed(4)})`,
                  containerType: "inline-size",
                  transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
                  transition: animating ? "width .45s cubic-bezier(.3,.7,.2,1), transform .45s cubic-bezier(.3,.7,.2,1)" : "none",
                }}
              >
                {focusMode ? (
                  focusId && (
                    <FocusView
                      focusId={focusId}
                      personaMap={personaMap}
                      edges={edges}
                      typeOrder={typeOrder}
                      ix={ix}
                      statusOf={statusOf}
                      onRecenter={(id) => { setSelectedPersonaId(id); clearHover(); }}
                      showSecond={showSecondRing}
                    />
                  )
                ) : (
                  <RingView
                    ring={ring}
                    personaMap={personaMap}
                    edges={edges}
                    ix={ix}
                    center={center}
                    onActivatePersona={activatePersona}
                    onOpenFocus={openFocus}
                    onActivatePlayer={activatePlayer}
                    onBackgroundClick={clearSelection}
                    groupArcs={groupArcs}
                  />
                )}
              </div>
            )}

            {tip && (
              <div
                role="tooltip"
                className="pointer-events-none absolute z-10 flex items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-floating"
                style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 10px))" }}
              >
                <TypeStroke type={tip.type} width={14} />
                <span className="text-foreground">{tip.from}</span>
                <span className="text-muted-foreground">{tip.directed ? "→" : "↔"}</span>
                <span className="text-foreground">{tip.to}</span>
                <span style={{ color: tip.type.color }}>{tip.text}</span>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-[18px] left-4 right-[196px] flex items-center gap-1.5 text-xs-plus text-muted-foreground">
              <MousePointerClick className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{t("canvasHint")}</span>
            </div>

            {!loading && personas.length > 0 && (
              <ViewOptions
                focusMode={focusMode}
                groupBy={effectiveGroupBy}
                canGroup={groups.length > 0}
                onGroupBy={setGroupBy}
                hideIsolated={hideIsolated}
                onHideIsolated={setHideIsolated}
                showSecondRing={showSecondRing}
                onShowSecondRing={setShowSecondRing}
              />
            )}

            <div
              className="absolute bottom-3 right-4 z-10 flex cursor-default items-center gap-0.5 rounded-lg border border-border bg-background/90 p-[3px]"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <Button variant="ghost" size="icon-sm" className="size-7" onClick={zoomOut} aria-label={tCommon("zoomOut")} title={tCommon("zoomOut")}>
                <Minus className="size-3.5" />
              </Button>
              <span className="min-w-[42px] text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)} %</span>
              <Button variant="ghost" size="icon-sm" className="size-7" onClick={zoomIn} aria-label={tCommon("zoomIn")} title={tCommon("zoomIn")}>
                <Plus className="size-3.5" />
              </Button>
              <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
              <Button variant="ghost" size="icon-sm" className="size-7" onClick={() => reset()} aria-label={t("resetView")} title={t("resetView")}>
                <Shrink className="size-3.5" />
              </Button>
            </div>
          </div>

          <RelationsSidePanel
            persona={panelPersona}
            playerId={focusMode ? null : selectedUserId}
            personas={personas}
            members={members}
            players={userList}
            relations={relations}
            relTypes={relTypes}
            personaMap={personaMap}
            typeOf={typeOf}
            groups={groups}
            groupByPersona={groupByPersona}
            groupColorOf={groupColorOf}
            handleOf={handleOf}
            statusOf={statusOf}
            relationCountOf={relationCountOf}
            pendingByPersona={pendingByPersona}
            typeCounts={typeCounts}
            hiddenTypes={hiddenTypes}
            onToggleType={(id) => setHiddenTypes((s) => toggle(s, id))}
            onShowAllTypes={() => setHiddenTypes(new Set())}
            userId={userId}
            canAdmin={canAdmin}
            canEditFrom={canEditFrom}
            onAssignGroup={(pid, gid) => void data.assignGroup(pid, gid)}
            onClose={closePanel}
            onBack={() => setSelectedPersonaId(null)}
            onOpenPersona={openPersona}
            onSelectPlayer={activatePlayer}
            onHoverPersona={setHoverPersonaId}
            onHoverUser={setHoverUserId}
            onHoverRelation={setHoverRelationId}
            onAccept={(id) => void data.acceptRelation(id)}
            onDelete={(id) => void data.deleteRelation(id)}
            onEdit={openEdit}
            onAdd={openCreate}
          />
        </div>

        {/* ── Petit écran : les cartes des personas, puis le détail ──
            Le plateau (zoom, cordes, survols) est illisible en petit écran.
            À la place, une rangée de cartes par joueur qu'on fait défiler de
            droite à gauche ; taper une carte ouvre le détail. ── */}
        <div data-testid="relations-mobile" className="flex min-h-0 flex-1 flex-col lg:hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{tCommon("loading")}</div>
          ) : panelProps ? (
            <PersonaRelationsPanel {...panelProps} onClose={() => setSelectedPersonaId(null)} closeLabel={tCommon("back")} closeIcon="back" />
          ) : (
            <div className="flex-1 overflow-y-auto py-1">
              {filteredUserList.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {search.trim() ? t("noSearchResults") : t("noPersonas")}
                </p>
              ) : filteredUserList.map(({ member, ps }) => {
                const dName = handleOf(member.user_id);
                const letter = dName.replace(/^@/, "")[0]?.toUpperCase() ?? "?";
                return (
                  <section key={member.user_id} aria-label={dName} className="space-y-2 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-2xs font-bold">
                        {member.avatar_url ? <Image src={member.avatar_url} alt={dName} fill sizes="20px" className="object-cover" /> : letter}
                      </span>
                      <span className="truncate text-xs font-medium text-muted-foreground">{dName}</span>
                      <span className="text-xs-plus tabular-nums text-muted-foreground">{ps.length}</span>
                    </div>
                    {/* ScrollArea plutôt qu'un simple overflow : à la souris, sans
                        barre, une rangée qui déborde ne se parcourt pas. `snap-x` :
                        au doigt, le défilement s'arrête carte par carte. */}
                    <ScrollArea className="-mx-1">
                      <div className="flex snap-x gap-3 px-1 pb-3 pt-1">
                        {ps.map((p) => {
                          const counts = countsByPersona.get(p.id);
                          return (
                            <PersonaCard
                              key={p.id}
                              persona={p}
                              groupColor={groupColor.get(p.id)}
                              dimmed={personaHidden(p.id)}
                              pendingCount={p.user_id === userId ? (counts?.pending ?? 0) : 0}
                              relationCount={counts?.total ?? 0}
                              onSelect={() => setSelectedPersonaId(p.id)}
                              className="shrink-0 snap-start"
                            />
                          );
                        })}
                      </div>
                      <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                  </section>
                );
              })}
            </div>
          )}

          {/* ── Légende, qui filtre, sous la liste ── */}
          {(relTypes.length > 0 || groups.length > 0 || hasRetired) && (
            <RelationsLegend
              relTypes={relTypes}
              typeCounts={typeCounts}
              groups={groups}
              hiddenTypes={hiddenTypes}
              hiddenGroups={hiddenGroups}
              onToggleType={(id) => setHiddenTypes((s) => toggle(s, id))}
              onToggleGroup={(id) => setHiddenGroups((s) => toggle(s, id))}
              hideRetired={hasRetired ? hideRetired : undefined}
              onToggleRetired={() => setHideRetired((v) => !v)}
              onReset={() => { setHiddenTypes(new Set()); setHiddenGroups(new Set()); setHideRetired(false); }}
              className="m-3 shrink-0"
            />
          )}
        </div>
      </div>

      {dialog && (
        <RelationDialog
          open
          onOpenChange={(open) => { if (!open) setDialog(null); }}
          from={dialog.from}
          personas={personas}
          relTypes={relTypes}
          myPersonaIds={myPersonaIds}
          existing={dialog.existing ?? null}
          onCreate={(input) => data.createRelation({ fromPersonaId: dialog.from.id, ...input })}
          onUpdate={(id, patch) => data.updateRelation(id, patch)}
        />
      )}
    </div>
  );
}
