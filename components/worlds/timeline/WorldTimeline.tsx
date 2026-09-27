"use client";

import { type ReactNode, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { BookOpen, BookText, Clock, Pencil, Plus, Search, Sparkles, Spline, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { compareTimelineDates, formatTimelineLabel } from "@/lib/worldTimeline";
import {
  DEFAULT_DORMANT_DAYS,
  NO_TIMELINE_FILTERS,
  TIMELINE_PAGE,
  ageOf,
  arcRanks,
  buildTimelinePeriods,
  buildTimelineSections,
  effectiveRoomStatus,
  eventEndItems,
  holidayItems,
  initialTimelineWindow,
  isFiltering,
  matchesTimelineFilters,
  normalizeAges,
  sliceTimelineSections,
  suiteChainOf,
  timelineRowCount,
  timelineRowOfYear,
  timelineRowsById,
  type TimelineDateGroup,
  type TimelineEventEndItem,
  type TimelineFilters,
  type TimelineHolidayItem,
  type TimelineItem,
  type TimelineJournalItem,
  type TimelineRoomContext,
  type TimelineRoomItem,
  type TimelineWindow,
  type TimelineYearSection,
} from "@/lib/worldTimelineItems";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import {
  GRAPH_OFFSET,
  SUITE_STYLES,
  SuiteLinks,
  type SuiteLink,
  type SuiteStyle,
} from "@/components/worlds/timeline/SuiteLinks";
import { EventSpans, eventSpanPad } from "@/components/worlds/timeline/EventSpans";
// Les dialogues de gestion ne servent qu'à qui gère la chronologie, et
// seulement une fois ouverts : leur code (sélecteur de date, formulaires)
// n'est chargé qu'à la première ouverture.
const TimelineArcsDialog = dynamic(() => import("@/components/worlds/timeline/TimelineArcsDialog").then((m) => m.TimelineArcsDialog));
const TimelineEventDialog = dynamic(() => import("@/components/worlds/timeline/TimelineEventDialog").then((m) => m.TimelineEventDialog));
import { TimelineFiltersPopover } from "@/components/worlds/timeline/TimelineFiltersPopover";
import { TimelineSequelRequests, type SequelRequest } from "@/components/worlds/timeline/TimelineSequelRequests";
import {
  useTimelineData,
  type TimelineArc,
  type TimelineEvent,
  type TimelineOpener,
} from "@/components/worlds/timeline/useTimelineData";
import type { WorldTimelineAge, WorldTimelineConfig } from "@/types/worlds";

/**
 * Le fond ambiant de la page, pour ce qui découpe le fil ou les filets (le
 * nom d'un mois, un anneau) et pour la barre de tête : sous `lg`, c'est
 * celui du `<body>` qu'on voit ; `<main>` ne pose `bg-background` qu'à partir
 * de `lg` (voir AppShell.tsx). Un `bg-background` seul faisait des pavés
 * visibles sur mobile.
 */
const AMBIENT_BG = "bg-body lg:bg-background";
const AMBIENT_BG_TRANSLUCENT = "bg-body/90 lg:bg-background/90";

/** Le style des lignes de suite, choisi par chacun et gardé dans son
 *  navigateur (une préférence de lecture, pas un réglage du monde). */
const SUITE_STYLE_KEY = "wvlds:timeline-suite-style";
const SUITE_HOVER_KEY = "wvlds:timeline-suite-hover";

function readSuiteHoverOnly(): boolean {
  try {
    return window.localStorage.getItem(SUITE_HOVER_KEY) === "1";
  } catch {
    return false;
  }
}

function readSuiteStyle(): SuiteStyle {
  try {
    const v = window.localStorage.getItem(SUITE_STYLE_KEY);
    return (SUITE_STYLES as readonly string[]).includes(v ?? "") ? (v as SuiteStyle) : "rail";
  } catch {
    return "rail";
  }
}

// Le rouge de repère : l'accent du thème sombre ; en clair, où l'accent est
// presque blanc, un rouge franc.
const RED_BG = "bg-red-600 dark:bg-accent";

/**
 * La chronologie d'un monde, en frise verticale : à gauche les années en très
 * grands chiffres, au centre un fil. Y paraissent les salons (un anneau
 * chacun, teinté par leur arc), les événements du monde (un losange) et, si
 * le monde le veut, les journaux datés des personas ; le jour d'une date
 * s'écrit une fois, à gauche du fil. Un filet sépare les années, un filet
 * pointillé chaque mois ; la date actuelle du monde barre la frise d'un trait
 * rouge, et la frise s'ouvre sur son année. Une fine courbe, à droite, relie
 * un salon à sa suite.
 *
 * En tête : la recherche, les filtres, et — pour qui gère la chronologie —
 * l'ajout d'un événement et les arcs ; puis les périodes : les saisons du
 * monde, ou des tranches de cinq ans pour les années hors saison.
 *
 * Tout se charge en une requête (voir useTimelineData) : un squelette tient
 * la place, puis la frise paraît d'un bloc. Seule une fenêtre de ses dates
 * est rendue, autour de l'année actuelle, et s'étend au défilement dans les
 * deux sens ; filtres, recherche, rangs et suites portent sur toute la frise.
 */
export function WorldTimeline({
  worldId,
  config,
  canManage = false,
  canManageLinks = false,
}: {
  worldId: string;
  config: WorldTimelineConfig;
  /** `timeline.manage` : événements et arcs. */
  canManage?: boolean;
  /** `chatrooms.manage` ou `timeline.manage` : accepter toute suite proposée. */
  canManageLinks?: boolean;
}) {
  const t = useTranslations("worlds");
  const tv = useTranslations("worlds.timelineView");
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  // La hauteur de la tête collée (recherche, filtres, périodes) : les bornes
  // des années se collent juste dessous (`--tl-head`).
  const [headHeight, setHeadHeight] = useState(0);
  useEffect(() => {
    const head = headRef.current;
    if (!head || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeadHeight(head.offsetHeight));
    observer.observe(head);
    setHeadHeight(head.offsetHeight);
    return () => observer.disconnect();
  }, []);
  const listRef = useRef<HTMLDivElement>(null);
  const data = useTimelineData(worldId, !!config.show_journals);

  const [filters, setFilters] = useState<TimelineFilters>(NO_TIMELINE_FILTERS);
  const [eventDialog, setEventDialog] = useState<{ open: boolean; event: TimelineEvent | null }>({ open: false, event: null });
  const [arcsOpen, setArcsOpen] = useState(false);
  // Montés à la première ouverture, puis gardés (pour leur fermeture animée).
  const [eventDialogUsed, setEventDialogUsed] = useState(false);
  const [arcsDialogUsed, setArcsDialogUsed] = useState(false);
  if (eventDialog.open && !eventDialogUsed) setEventDialogUsed(true);
  if (arcsOpen && !arcsDialogUsed) setArcsDialogUsed(true);
  const [lanes, setLanes] = useState(0);
  const [spanLanes, setSpanLanes] = useState(0);
  const [suiteStyle, setSuiteStyleState] = useState<SuiteStyle>("rail");
  const [hoverOnly, setHoverOnlyState] = useState(false);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  // « Pendant ce temps » : l'événement qui dure survolé (ou sa fin).
  const [hoveredSpan, setHoveredSpan] = useState<string | null>(null);
  useEffect(() => {
    setSuiteStyleState(readSuiteStyle());
    setHoverOnlyState(readSuiteHoverOnly());
  }, []);
  function setHoverOnly(next: boolean) {
    setHoverOnlyState(next);
    setHoveredRoom(null);
    try { window.localStorage.setItem(SUITE_HOVER_KEY, next ? "1" : "0"); } catch { /* navigation privée */ }
  }
  function setSuiteStyle(next: SuiteStyle) {
    setSuiteStyleState(next);
    setHoveredRoom(null);
    try { window.localStorage.setItem(SUITE_STYLE_KEY, next); } catch { /* navigation privée */ }
  }

  const arcsById = useMemo(() => new Map(data.arcs.map((a) => [a.id, a])), [data.arcs]);
  const eventsById = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data.events]);

  // Les salons que chaque salon suit (liens acceptés ou proposés).
  const previousOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of data.sequels) {
      if (!map.has(s.chatroomId)) map.set(s.chatroomId, []);
      map.get(s.chatroomId)!.push(s.previousId);
    }
    return map;
  }, [data.sequels]);

  // « En sommeil » se compte à partir de l'ouverture de la frise.
  const [now] = useState(() => Date.now());
  const dormantDays = config.dormant_days ?? DEFAULT_DORMANT_DAYS;

  const allItems: TimelineItem[] = useMemo(() => {
    const roomItems: TimelineRoomItem[] = data.rooms.map((r) => ({
      kind: "room",
      id: r.id,
      date: r.date,
      title: r.title ?? r.name ?? t("timelineUntitled"),
      arcId: r.arcId,
      previousIds: previousOf.get(r.id) ?? [],
      categoryId: r.categoryId,
      status: effectiveRoomStatus(r.status, r.lastActivity, dormantDays, now),
    }));
    return [...roomItems, ...data.events, ...eventEndItems(data.events), ...data.journals];
  }, [data.rooms, data.events, data.journals, previousOf, t, dormantDays, now]);

  // Le rang de chaque salon dans son arc, sur tous les salons : il ne change
  // pas quand on filtre.
  const ranks = useMemo(() => arcRanks(allItems), [allItems]);

  const ctx: TimelineRoomContext = useMemo(
    () => ({ personas: data.roomPersonas, openers: data.openers }),
    [data.roomPersonas, data.openers],
  );
  // La recherche filtre toute la frise : sur un gros monde, ce calcul passe
  // après la frappe (valeur différée), qui reste fluide ; le champ, lui, suit
  // chaque touche.
  const deferredQuery = useDeferredValue(filters.query);
  const applied = useMemo(() => ({ ...filters, query: deferredQuery }), [filters, deferredQuery]);
  const visible = useMemo(
    () => allItems.filter((i) => matchesTimelineFilters(i, applied, ctx)),
    [allItems, applied, ctx],
  );

  // L'année actuelle du monde a toujours sa section — sauf si les filtres ne
  // laissent rien : la frise dit alors qu'aucun résultat ne correspond.
  // Les fêtes du calendrier s'ajoutent ensuite, dans les mois qui ont déjà
  // une entrée : une fête seule ne crée ni mois ni année.
  const sections = useMemo(() => {
    const base = buildTimelineSections(visible, config.current_year);
    const months = base.flatMap((s) =>
      s.groups.filter((g) => g.month !== null).map((g) => ({ year: s.year, month: g.month! })),
    );
    const holidays = holidayItems(config.holidays, months, config.month_names.length)
      .filter((h) => matchesTimelineFilters(h, applied, ctx));
    return holidays.length > 0 ? buildTimelineSections([...visible, ...holidays], config.current_year) : base;
  }, [visible, config.current_year, config.holidays, config.month_names.length, applied, ctx]);

  // La fenêtre rendue (voir sliceTimelineSections) : posée à la première
  // réponse et à chaque changement de filtre, étendue au défilement.
  const [win, setWin] = useState<TimelineWindow | null>(null);
  const totalRows = timelineRowCount(sections);
  const shown = useMemo(() => {
    if (!win) return [];
    return sliceTimelineSections(sections, { start: Math.min(win.start, totalRows), end: Math.min(win.end, totalRows) });
  }, [sections, win, totalRows]);

  // Les événements qui durent (début et fin passent les filtres) dont la
  // durée croise la fenêtre ; un bout hors de la fenêtre prolonge la barre
  // jusqu'au bord de ce qui est rendu.
  const spanIds = useMemo(() => {
    const ends = new Set(visible.filter((i) => i.kind === "eventEnd").map((i) => (i as TimelineEventEndItem).eventId));
    return visible.filter((i) => i.kind === "event" && ends.has(i.id)).map((i) => i.id);
  }, [visible]);
  const rowsById = useMemo(() => timelineRowsById(sections), [sections]);
  const eventSpans = useMemo(() => {
    if (!win) return [];
    return spanIds.flatMap((id) => {
      const from = rowsById.get(id);
      const to = rowsById.get(`${id}:end`);
      if (from === undefined || to === undefined || to < win.start || from >= win.end) return [];
      return [{ id, clipTop: from < win.start, clipBottom: to >= win.end }];
    });
  }, [spanIds, rowsById, win]);

  const ages = useMemo(() => normalizeAges(config.ages), [config.ages]);
  const { periods, periodOf } = useMemo(
    () => buildTimelinePeriods(sections.map((s) => s.year), ages),
    [sections, ages],
  );
  const [activePeriod, setActivePeriod] = useState(() => periodOf(config.current_year));

  // Les suites dont les deux salons sont à l'écran. Proposées, elles se
  // tracent en pointillés ; reliées à la chaîne d'un arc, elles en prennent
  // la couleur (voir SuiteLinks). Une suite qui passe d'un arc à un autre
  // est une passerelle : elle ne fond pas les deux arcs en une chaîne.
  const suiteLinks: SuiteLink[] = useMemo(() => {
    const shown = new Map(
      visible.filter((i): i is TimelineRoomItem => i.kind === "room").map((i) => [i.id, i]),
    );
    const colorOf = (id: string) => {
      const arcId = shown.get(id)?.arcId;
      return arcId ? arcsById.get(arcId)?.color ?? null : null;
    };
    return data.sequels
      .filter((s) => shown.has(s.chatroomId) && shown.has(s.previousId))
      .map((s) => {
        const fromArc = shown.get(s.previousId)?.arcId ?? null;
        const toArc = shown.get(s.chatroomId)?.arcId ?? null;
        return {
          from: s.previousId,
          to: s.chatroomId,
          color: colorOf(s.chatroomId) ?? colorOf(s.previousId),
          pending: s.status === "pending",
          ...(fromArc && toArc && fromArc !== toArc ? { bridgeFrom: colorOf(s.previousId) } : {}),
        };
      });
  }, [visible, arcsById, data.sequels]);

  // Les suites proposées que l'on peut accepter : accrochées à un salon où
  // l'on joue, ou toutes pour qui gère les salons ou la chronologie.
  const titleOf = useMemo(
    () => new Map(data.rooms.map((r) => [r.id, r.title ?? r.name ?? t("timelineUntitled")])),
    [data.rooms, t],
  );
  const requests: SequelRequest[] = useMemo(
    () => data.sequels
      .filter((s) => s.status === "pending" && (canManageLinks || data.mine.has(s.previousId)))
      .map((s) => ({
        id: s.id,
        chatroomTitle: titleOf.get(s.chatroomId) ?? t("timelineUntitled"),
        previousTitle: titleOf.get(s.previousId) ?? t("timelineUntitled"),
        createdByName: s.createdByName,
      })),
    [data.sequels, data.mine, canManageLinks, titleOf, t],
  );
  // Au survol seulement : rien au repos ; la chaîne du salon survolé
  // s'allume, dans le style choisi, et le reste de la frise s'estompe.
  const suiteHighlight = useMemo(
    () => (hoverOnly && hoveredRoom ? suiteChainOf(suiteLinks, hoveredRoom) : null),
    [hoverOnly, hoveredRoom, suiteLinks],
  );
  const onlyChain = hoverOnly ? (suiteHighlight ?? new Set<string>()) : null;

  // « Pendant ce temps » : au survol d'un événement qui dure, ce qui se passe
  // entre son début et sa fin reste net, le reste s'estompe — à la finesse
  // des deux dates (une date « an 3 » est pendant un hiver de l'an 3).
  const duringSpan = useMemo(() => {
    const event = hoveredSpan ? data.events.find((e) => e.id === hoveredSpan) : null;
    if (!event?.endDate) return null;
    const ids = new Set<string>([event.id, `${event.id}:end`]);
    for (const s of sections) {
      for (const g of s.groups) {
        for (const i of g.items) {
          if (compareTimelineDates(i.date, event.date) >= 0 && compareTimelineDates(i.date, event.endDate) <= 0) ids.add(i.id);
        }
      }
    }
    return ids;
  }, [hoveredSpan, data.events, sections]);
  const highlight = duringSpan ?? suiteHighlight;

  /** L'événement qui dure sous le pointeur ou le focus (sa ligne ou sa fin). */
  function spanUnder(target: HTMLElement): string | null {
    const row = target.closest<HTMLElement>("[data-event-id], [data-event-end-id]");
    const id = row?.dataset.eventId ?? row?.dataset.eventEndId ?? null;
    return id && spanIds.includes(id) ? id : null;
  }
  function trackHover(target: HTMLElement) {
    setHoveredSpan(spanUnder(target));
    if (hoverOnly) setHoveredRoom(target.closest<HTMLElement>("[data-room-id]")?.dataset.roomId ?? null);
  }

  // Le fil du persona filtré : les salons où il a écrit et ses entrées de
  // journal, reliés sur le fil de la frise, dans la couleur de son groupe.
  const threadPersona = filters.personaId ? data.personas.find((p) => p.id === filters.personaId) ?? null : null;
  const thread = useMemo(() => {
    if (!threadPersona) return null;
    const ids = visible
      .filter((i) =>
        (i.kind === "room" && data.roomPersonas.get(i.id)?.has(threadPersona.id)) ||
        (i.kind === "journal" && i.personaId === threadPersona.id))
      .map((i) => i.id);
    return { ids, color: threadPersona.color };
  }, [threadPersona, visible, data.roomPersonas]);
  const layoutVersion = useMemo(
    () => `${suiteStyle}:${threadPersona?.id ?? ""}:${shown.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.id))).join(",")}`,
    [shown, suiteStyle, threadPersona],
  );
  // Le graphe prend place entre le fil et les titres ; les autres styles, à droite.
  const graphPad = suiteStyle === "graph" && lanes > 0 ? GRAPH_OFFSET + (lanes - 1) * 8 + 10 : 0;
  const rightPad = suiteStyle === "rail" && lanes > 0 ? 20 + 12 + lanes * 10 + 14 : undefined;
  const onLanes = useCallback((n: number) => setLanes(n), []);
  // Le décalage des titres : les couloirs du graphe, puis ceux des barres de
  // durée, qui se logent juste avant le texte.
  const titlePad = graphPad + eventSpanPad(spanLanes);
  const onSpanLanes = useCallback((n: number) => setSpanLanes(n), []);

  const players = useMemo(
    () => [...new Set([...data.openers.values()].map((o) => o.name))].sort().map((n) => ({ id: n, label: `@${n}` })),
    [data.openers],
  );

  function sectionEl(year: number): HTMLElement | null {
    return scrollRef.current?.querySelector<HTMLElement>(`[data-year="${year}"]`) ?? null;
  }

  // Défiler jusqu'à une année, une fois qu'elle est rendue : une année hors
  // de la fenêtre y entre d'abord (la fenêtre s'ouvre sur elle).
  const [pendingYear, setPendingYear] = useState<{ year: number; smooth: boolean } | null>(null);
  function scrollToYear(year: number, smooth: boolean) {
    const row = timelineRowOfYear(sections, year);
    if (row < 0) return;
    if (win && (row < win.start || row >= win.end)) {
      setWin({ start: row, end: Math.min(totalRows, row + TIMELINE_PAGE) });
    }
    setPendingYear({ year, smooth });
  }
  useLayoutEffect(() => {
    if (!pendingYear) return;
    const el = scrollRef.current;
    const section = sectionEl(pendingYear.year);
    if (!el || !section) return;
    const top = section.offsetTop - (headRef.current?.offsetHeight ?? 0);
    if (typeof el.scrollTo === "function") el.scrollTo({ top, behavior: pendingYear.smooth ? "smooth" : "auto" });
    else el.scrollTop = top;
    setPendingYear(null);
    // `shown` : l'année demandée n'est peut-être rendue qu'au rendu suivant.
  }, [pendingYear, shown]);

  // La fenêtre : à la première réponse, ouverte sur l'année actuelle ; à
  // chaque changement de filtre ou de recherche, sur l'année actuelle si
  // rien ne filtre, sinon depuis le premier résultat.
  const filterKey = JSON.stringify([
    applied.query, [...applied.kinds].sort(), applied.personaId, applied.player, applied.arcId, applied.categoryId, applied.status,
  ]);
  useEffect(() => {
    if (data.loading) return;
    if (isFiltering(applied)) {
      setWin({ start: 0, end: Math.min(totalRows, TIMELINE_PAGE) });
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    } else {
      setWin(initialTimelineWindow(sections, config.current_year));
      setPendingYear({ year: config.current_year, smooth: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- à la première réponse et quand les filtres changent
  }, [data.loading, filterKey]);

  // Le défilement infini : une sentinelle en haut et en bas de ce qui est
  // rendu ; à l'approche de l'une, une page de plus de ce côté. Le haut
  // s'étend sans faire sauter la lecture : la hauteur ajoutée au-dessus est
  // rendue au défilement.
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  const keepScroll = useRef<{ height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !keepScroll.current) return;
    el.scrollTop = keepScroll.current.top + (el.scrollHeight - keepScroll.current.height);
    keepScroll.current = null;
  }, [shown]);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !win || typeof IntersectionObserver === "undefined") return;
    // Un nouvel observateur à chaque fenêtre : il signale tout de suite une
    // sentinelle encore visible, et la frise se remplit jusqu'à déborder.
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (entry.target === topSentinel.current && win.start > 0) {
          keepScroll.current = { height: root.scrollHeight, top: root.scrollTop };
          setWin({ start: Math.max(0, win.start - TIMELINE_PAGE), end: win.end });
        } else if (entry.target === bottomSentinel.current && win.end < totalRows) {
          setWin({ start: win.start, end: Math.min(totalRows, win.end + TIMELINE_PAGE) });
        }
      }
    }, { root, rootMargin: "600px 0px" });
    if (topSentinel.current) observer.observe(topSentinel.current);
    if (bottomSentinel.current) observer.observe(bottomSentinel.current);
    return () => observer.disconnect();
  }, [win, totalRows]);

  // Les périodes suivent le défilement : celle de la dernière année passée
  // sous la tête.
  // Le bandeau de l'année collé sous la tête : celle dont le haut est passé
  // sous la tête et le bas pas encore. Au repos, un bandeau est transparent
  // et laisse voir les lignes de suite ; collé, il les couvre.
  const [stuckYear, setStuckYear] = useState<number | null>(null);
  function updateStuckYear() {
    const el = scrollRef.current;
    if (!el) return;
    const headBottom = el.getBoundingClientRect().top + (headRef.current?.offsetHeight ?? 0);
    let stuck: number | null = null;
    for (const s of shown) {
      const r = sectionEl(s.year)?.getBoundingClientRect();
      if (r && r.top < headBottom - 0.5 && r.bottom > headBottom) stuck = s.year;
    }
    setStuckYear(stuck);
  }
  useEffect(() => {
    updateStuckYear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quand la frise ou la tête changent
  }, [shown, headHeight]);

  function onScroll() {
    updateStuckYear();
    const el = scrollRef.current;
    if (!el || periods.length < 2) return;
    const seuil = el.getBoundingClientRect().top + (headRef.current?.offsetHeight ?? 0) + 8;
    let current = shown[0]?.year ?? 0;
    for (const s of shown) {
      const node = sectionEl(s.year);
      if (node && node.getBoundingClientRect().top <= seuil) current = s.year;
    }
    setActivePeriod(periodOf(current));
  }

  const nowLabel = t("settings.timelinePreviewLabel");
  const empty = !data.loading && allItems.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorldPanelHeader
        icon={<Clock className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("nav.timeline")}
      />

      {empty && !canManage ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">{t("timelineEmpty")}</p>
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="relative flex-1 overflow-y-auto"
          style={{ ["--tl-head" as string]: `${headHeight}px` }}
          data-testid="timeline-scroll"
        >
          <div ref={headRef} className={cn("sticky top-0 z-10 space-y-3 px-5 py-3 backdrop-blur", AMBIENT_BG_TRANSLUCENT)}>
            {/* Recherche, filtres, gestion */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-40 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  value={filters.query}
                  onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                  placeholder={tv("search")}
                  aria-label={tv("search")}
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <TimelineFiltersPopover
                filters={filters}
                onChange={setFilters}
                showJournals={!!config.show_journals}
                showHolidays={(config.holidays ?? []).length > 0}
                personas={data.personas.map((p) => ({ id: p.id, label: p.name }))}
                players={players}
                arcs={data.arcs.map((a) => ({ id: a.id, label: a.name }))}
                categories={data.categories.map((c) => ({ id: c.id, label: c.title }))}
                suiteStyle={suiteStyle}
                onSuiteStyle={setSuiteStyle}
                hoverOnly={hoverOnly}
                onHoverOnly={setHoverOnly}
              />
              {/* Le fil du persona filtré, rappelé en tête ; la croix l'efface. */}
              {threadPersona && (
                <span
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border pl-2.5 pr-1 text-xs"
                  data-testid="timeline-persona-thread-chip"
                >
                  <span
                    className={cn("size-2.5 rounded-full", !threadPersona.color && "bg-foreground")}
                    style={threadPersona.color ? { backgroundColor: threadPersona.color } : undefined}
                    aria-hidden
                  />
                  {tv("personaThread", { name: threadPersona.name })}
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, personaId: null })}
                    aria-label={tv("personaThreadClear", { name: threadPersona.name })}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <TimelineSequelRequests requests={requests} supabase={data.supabase} onChanged={() => void data.reload()} />
              {canManage && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => setEventDialog({ open: true, event: null })}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {tv("addEvent")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => setArcsOpen(true)}>
                    <Spline className="h-3.5 w-3.5" />
                    {tv("arcs")}
                  </Button>
                </>
              )}
            </div>

            {periods.length > 1 && (
              <nav aria-label={t("timelineRanges")} className="flex gap-2 overflow-x-auto">
                {periods.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    aria-current={p.key === activePeriod ? "true" : undefined}
                    onClick={() => { setActivePeriod(p.key); scrollToYear(p.firstYear, true); }}
                    className={cn(
                      "h-7 shrink-0 rounded-full px-4 text-xs font-medium tabular-nums transition-colors",
                      p.key === activePeriod
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </nav>
            )}
          </div>

          {data.loading ? (
            <TimelineSkeleton label={tv("loading")} />
          ) : empty ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">{t("timelineEmpty")}</p>
          ) : sections.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground" data-testid="timeline-no-match">{tv("noMatch")}</p>
          ) : (
            <div
              ref={listRef}
              className="relative"
              data-suite-style={suiteStyle}
              onMouseOver={(e) => trackHover(e.target as HTMLElement)}
              onMouseLeave={() => {
                setHoveredRoom(null);
                setHoveredSpan(null);
              }}
              onFocus={(e) => trackHover(e.target as HTMLElement)}
            >
              {win && win.start > 0 && <div ref={topSentinel} className="h-px" data-testid="timeline-more-before" aria-hidden />}
              <ol
                className="px-5 pb-6"
                // Les couloirs des lignes de suite : à droite, ou, pour le
                // graphe, entre le fil et les titres ; et ceux des barres de
                // durée, avant les titres (`--tl-graph-pad`).
                style={{
                  paddingRight: rightPad,
                  ["--tl-graph-pad" as string]: `${titlePad}px`,
                  // Pour qu'un filet de mois aille d'un bord à l'autre.
                  ["--tl-right-pad" as string]: `${rightPad ?? 20}px`,
                }}
              >
                {shown.map((section) => {
                  const age = ageOf(ages, section.year);
                  // Le bandeau d'une saison, devant sa première année :
                  // l'année d'avant sur toute la frise, pas seulement rendue.
                  const full = sections.findIndex((s) => s.year === section.year);
                  const prevAge = full > 0 ? ageOf(ages, sections[full - 1].year) : null;
                  return (
                    <SectionWithAge key={section.year} age={age && age !== prevAge ? age : null} config={config}>
                      <YearBlock
                        section={section}
                        config={config}
                        nowLabel={nowLabel}
                        openers={data.openers}
                        arcsById={arcsById}
                        ranks={ranks}
                        canManage={canManage}
                        highlight={highlight}
                        stuck={stuckYear === section.year}
                        onOpenRoom={(id) => router.push(`/c/${id}`)}
                        onOpenWiki={(slug) => router.push(`/w/${worldId}?view=wiki&page=${encodeURIComponent(slug)}`)}
                        onEditEvent={(id) => {
                          const event = eventsById.get(id);
                          if (event) setEventDialog({ open: true, event });
                        }}
                      />
                    </SectionWithAge>
                  );
                })}
              </ol>
              <SuiteLinks containerRef={listRef} links={suiteLinks} style={suiteStyle} only={onlyChain} thread={thread} version={layoutVersion} onLanes={onLanes} />
              {/* Se remesure aussi quand la place des lignes de suite change
                  (style, « au survol seulement ») : les titres, sur lesquels
                  se calent les barres, se décalent alors sans que la frise
                  ni la taille de la liste ne changent. */}
              {win && win.end < totalRows && <div ref={bottomSentinel} className="h-px" data-testid="timeline-more-after" aria-hidden />}
              <EventSpans
                containerRef={listRef}
                spans={eventSpans}
                active={duringSpan ? hoveredSpan : null}
                version={`${layoutVersion}:${titlePad}:${rightPad ?? 0}`}
                onLanes={onSpanLanes}
              />
            </div>
          )}
        </div>
      )}

      {canManage && eventDialogUsed && (
        <TimelineEventDialog
          open={eventDialog.open}
          onOpenChange={(open) => setEventDialog((d) => ({ ...d, open }))}
          supabase={data.supabase}
          worldId={worldId}
          config={config}
          event={eventDialog.event}
          onSaved={() => void data.reload()}
        />
      )}
      {canManage && arcsDialogUsed && (
        <TimelineArcsDialog
          open={arcsOpen}
          onOpenChange={setArcsOpen}
          supabase={data.supabase}
          worldId={worldId}
          arcs={data.arcs}
          onChanged={() => void data.reload()}
        />
      )}
    </div>
  );
}

/**
 * Ce que le squelette esquisse : deux années, chacune avec ses mois et, pour
 * chaque date, la largeur de son titre (en %) et de son « par … ».
 */
const SKELETON_YEARS: { months: { title: number; by: number }[][] }[] = [
  { months: [[{ title: 38, by: 16 }, { title: 52, by: 12 }], [{ title: 44, by: 18 }]] },
  { months: [[{ title: 56, by: 14 }], [{ title: 34, by: 20 }, { title: 48, by: 12 }]] },
];
const SKELETON_BAR = "animate-pulse rounded bg-muted";

/**
 * La place de la frise pendant son chargement, dessinée comme elle : le
 * bandeau de l'année (légende et chiffre), la colonne des jours et des mois,
 * le fil et ses anneaux, les titres suivis de leur « par … », les filets
 * pointillés des mois — aux mêmes retraits, pour que la frise s'y pose sans
 * que rien ne saute.
 */
function TimelineSkeleton({ label }: { label: string }) {
  return (
    <div className="px-5 pb-6" role="status" aria-busy="true" data-testid="timeline-loading">
      <span className="sr-only">{label}</span>
      <ol aria-hidden>
        {SKELETON_YEARS.map((year, y) => (
          <li key={y}>
            <div className={cn("-mx-5 flex items-center gap-1.5 border-y border-border px-5 py-2", y === 0 && "border-t-0")}>
              <span className={cn(SKELETON_BAR, "h-2.5 w-7")} />
              <span className={cn(SKELETON_BAR, "h-4 w-5")} />
            </div>
            <div className="relative ml-24 py-8 pl-7">
              <span className="absolute inset-y-0 left-0 w-px bg-border" />
              <ul className="space-y-4">
                {year.months.map((dates, m) => (
                  <li key={m} className={cn("relative", m > 0 && "pt-12")}>
                    {/* Le nom du mois, calé sur les jours ; au-delà du premier,
                        posé sur son filet pointillé. */}
                    {m > 0 && (
                      <span className="absolute -left-[9rem] -right-5 top-4 border-t border-dashed border-border" />
                    )}
                    <span
                      className={cn(SKELETON_BAR, "absolute right-[calc(100%+2.5rem)] h-2 w-12", m > 0 ? "top-[0.75rem]" : "-top-5")}
                    />
                    <ul className="space-y-1.5">
                      {dates.map((d, i) => (
                        <li key={i} className="relative flex h-5 items-center gap-2">
                          <span className={cn(SKELETON_BAR, "absolute right-[calc(100%+2.5rem)] top-0.5 h-4 w-4")} />
                          <span className={cn("absolute -left-[33.5px] top-1 size-3 rounded-full border-[1.5px] border-border", AMBIENT_BG)} />
                          <span className={cn(SKELETON_BAR, "h-3.5")} style={{ width: `${d.title}%` }} />
                          <span className={cn(SKELETON_BAR, "h-2.5 opacity-60")} style={{ width: `${d.by}%` }} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Une saison ouvre ses années d'un bandeau : son nom, ses bornes. */
function SectionWithAge({
  age,
  config,
  children,
}: {
  age: WorldTimelineAge | null;
  config: WorldTimelineConfig;
  children: ReactNode;
}) {
  if (!age) return <>{children}</>;
  const bounds = age.to_year === null
    ? `${config.year_label} ${age.from_year} –`
    : `${config.year_label} ${age.from_year} – ${age.to_year}`;
  return (
    <>
      <li
        // Au-dessus du bandeau de sa première année.
        className="pb-4 pt-8 first:pt-2"
        data-testid="timeline-age"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">{age.name}</p>
        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{bounds}</p>
      </li>
      {children}
    </>
  );
}

/** La légende d'une année (« Eon », le nom d'ère), dans son bandeau :
 *  petites capitales, plus appuyées que celles des mois. */
const YEAR_CAPTION = "text-[11px] font-semibold uppercase tracking-[0.15em] text-foreground/60";

function YearBlock({
  section,
  config,
  nowLabel,
  openers,
  arcsById,
  ranks,
  canManage,
  highlight,
  stuck,
  onOpenRoom,
  onOpenWiki,
  onEditEvent,
}: {
  section: TimelineYearSection;
  config: WorldTimelineConfig;
  nowLabel: string;
  openers: ReadonlyMap<string, TimelineOpener>;
  arcsById: ReadonlyMap<string, TimelineArc>;
  ranks: ReadonlyMap<string, number>;
  canManage: boolean;
  highlight: ReadonlySet<string> | null;
  /** Le bandeau de l'année est collé sous la tête. */
  stuck: boolean;
  onOpenRoom: (id: string) => void;
  onOpenWiki: (slug: string) => void;
  onEditEvent: (id: string) => void;
}) {
  const { groups } = section;
  const isNow = section.year === config.current_year;
  // La date actuelle du monde barre l'année d'un trait rouge, à son mois.
  const nowMonth = config.current_month;
  let insertAt = -1;
  if (isNow) {
    const after = nowMonth === null ? 0 : groups.findIndex((g) => (g.month ?? -1) > nowMonth);
    insertAt = after === -1 ? groups.length : after;
  }
  const nowText = `${nowLabel} : ${formatTimelineLabel(config, { year: config.current_year, month: nowMonth, day: null })}`;

  // Un filet ouvre chaque nouveau mois (sauf le premier de l'année).
  const entries: ReactNode[] = groups.map((group, i) => (
    <DateGroupBlock
      key={group.key}
      year={section.year}
      group={group}
      config={config}
      openers={openers}
      arcsById={arcsById}
      ranks={ranks}
      canManage={canManage}
      highlight={highlight}
      newMonth={i > 0 && groups[i - 1].month !== group.month}
      onOpenRoom={onOpenRoom}
      onOpenWiki={onOpenWiki}
      onEditEvent={onEditEvent}
    />
  ));
  if (insertAt >= 0) {
    entries.splice(insertAt, 0, (
      <li key="now" className="relative h-2" data-testid="timeline-now" title={nowText}>
        {/* Un trait plein, sans texte, du fil jusqu'au bord — la colonne des
            années reste libre ; un carré rouge sur le fil. */}
        <span
          className={cn("absolute -left-7 right-0 top-1/2 h-0.5 -translate-y-1/2", RED_BG)}
          aria-hidden
        />
        <span className={cn("absolute -left-[32.5px] top-1/2 size-2.5 -translate-y-1/2", RED_BG)} aria-hidden />
        <span className="sr-only">{nowText}</span>
      </li>
    ));
  }

  const firstMonth = groups[0]?.month ?? null;
  const firstMonthName = firstMonth !== null ? (config.month_names[firstMonth] ?? null) : null;

  return (
    <li data-year={section.year}>
      {/* L'année, un bandeau sur toute la largeur du conteneur (marges de la
          liste comprises), collé sous la tête le temps de son année : on sait
          toujours où l'on est, et deux années se séparent franchement. Au
          repos, transparent et sous les lignes de suite (z-[1] ; z-[2] pour
          les lignes, voir SuiteLinks) : elles le traversent, ses traits
          compris. Collé, il passe au-dessus d'elles et des salons (z-[3]),
          prend le fond de la page et les couvre ; toujours sous la tête
          (z-10). Le fil s'y interrompt ; un trait dessus et dessous (aucun
          au-dessus de la toute première année).
          Le titre à gauche, le chiffre en gras. */}
      <div
        className={cn(
          "sticky top-[var(--tl-head,0px)] -ml-5 -mr-[var(--tl-right-pad,20px)] flex items-center gap-3 border-y border-border py-2 [li:first-child>&]:border-t-0 px-5",
          stuck ? cn("z-[3]", AMBIENT_BG) : "z-[1]",
        )}
        data-testid="timeline-year-band"
        data-stuck={stuck || undefined}
      >
        <h3 className="flex min-w-0 items-baseline gap-1.5 leading-none">
          {/* Les espaces entre les parties : invisibles en flex, mais lus
              (« An 1 », pas « An1 »). */}
          <span className={YEAR_CAPTION}>{config.year_label}</span>{" "}
          <span
            className="text-lg font-bold leading-none tabular-nums text-foreground"
            data-testid="timeline-year-number"
          >
            {section.year}
          </span>
          {config.era_name && (
            <>
              {" "}
              <span className={cn(YEAR_CAPTION, "truncate")}>{config.era_name}</span>
            </>
          )}
        </h3>
      </div>
      {/* La colonne de gauche (6rem) porte les jours et les mois. */}
      <div className="relative ml-24 py-8 pl-7">
        {/* Le fil : d'une section à l'autre, il ne s'interrompt pas. */}
        <span className="absolute inset-y-0 left-0 w-px bg-border" aria-hidden />
        {/* Le premier mois de l'année, sous le bandeau, calé sur le jour (le
            texte finit 0.75rem avant le fil : 0.25rem + px-2) ; les suivants
            se posent sur leur filet. */}
        {firstMonthName && (
          <span
            className="absolute right-[calc(100%+0.25rem)] top-3 whitespace-nowrap px-2 text-right text-[10px] font-medium uppercase leading-none tracking-wider text-muted-foreground"
            data-testid="timeline-first-month"
            aria-hidden
          >
            {firstMonthName}
          </span>
        )}
        <ul className="space-y-4">{entries}</ul>
      </div>
    </li>
  );
}

/** « par Tess (@Poumon) », ou « par @Poumon » sans persona — la phrase
 *  lue par les lecteurs d'écran, la même qu'à l'écran. */
function openerText(opener: TimelineOpener, by: (name: string) => string): string {
  return opener.persona ? `${by(opener.persona)} (@${opener.name})` : by(`@${opener.name}`);
}

/**
 * Une date de la frise : ce qu'elle réunit, chacun avec sa marque sur le
 * fil ; le jour, une fois, à gauche du fil en face du premier.
 */
function DateGroupBlock({
  year,
  group,
  config,
  openers,
  arcsById,
  ranks,
  canManage,
  highlight,
  newMonth,
  onOpenRoom,
  onOpenWiki,
  onEditEvent,
}: {
  year: number;
  group: TimelineDateGroup;
  config: WorldTimelineConfig;
  openers: ReadonlyMap<string, TimelineOpener>;
  arcsById: ReadonlyMap<string, TimelineArc>;
  ranks: ReadonlyMap<string, number>;
  canManage: boolean;
  highlight: ReadonlySet<string> | null;
  newMonth: boolean;
  onOpenRoom: (id: string) => void;
  onOpenWiki: (slug: string) => void;
  onEditEvent: (id: string) => void;
}) {
  const monthName = group.month !== null ? (config.month_names[group.month] ?? null) : null;
  const fullDate = formatTimelineLabel(config, { year, month: group.month, day: group.day });
  return (
    <li
      className={cn("relative", newMonth && "pt-12")}
      data-date-group={group.key}
      data-new-month={newMonth || undefined}
    >
      {/* Le filet d'un nouveau mois, en pointillés, d'un bord à l'autre du
          conteneur (colonne des années, marge des suites comprises), à égale
          distance des deux dates : 32px de chaque côté. En padding, pas en
          marge : la marge basse de `space-y-4` sur la date précédente
          fusionnait avec une marge haute, et le haut restait plus serré
          (16 + 16 au-dessus du filet, 48 − 16 dessous). Le nom du mois posé dessus, en
          petites capitales, à gauche du fil, calé à droite sur le jour : même
          retrait que lui depuis le fil (2.5rem, dont les 0.5rem de son fond).
          Les décalages du filet remontent la colonne des jours (6rem), le
          retrait du fil (pl-7) et la marge de la liste (px-5). */}
      {newMonth && (
        <>
          <span
            className="absolute -left-[9rem] -right-[var(--tl-right-pad,20px)] top-4 border-t border-dashed border-border"
            data-testid="timeline-month-rule"
            aria-hidden
          />
          {monthName && (
            <span
              className={cn("absolute right-[calc(100%+2rem)] top-4 -translate-y-1/2 whitespace-nowrap px-2 text-right text-[10px] font-medium uppercase leading-none tracking-wider text-muted-foreground", AMBIENT_BG)}
              data-testid="timeline-month-label"
              aria-hidden
            >
              {monthName}
            </span>
          )}
        </>
      )}
      <ul className="space-y-1.5">
        {group.items.map((item, i) => {
          const day = i === 0 ? group.day : null;
          const dimmed = highlight !== null && !highlight.has(item.id);
          switch (item.kind) {
            case "room":
              return (
                <RoomRow
                  key={item.id}
                  item={item}
                  day={day}
                  fullDate={fullDate}
                  opener={openers.get(item.id) ?? null}
                  arc={item.arcId ? arcsById.get(item.arcId) ?? null : null}
                  rank={ranks.get(item.id) ?? null}
                  dimmed={dimmed}
                  onClick={() => onOpenRoom(item.id)}
                />
              );
            case "event":
              return (
                <EventRow
                  key={item.id}
                  item={item as TimelineEvent}
                  day={day}
                  canManage={canManage}
                  dimmed={dimmed}
                  onOpenWiki={onOpenWiki}
                  onEdit={() => onEditEvent(item.id)}
                />
              );
            case "eventEnd":
              return <EventEndRow key={item.id} item={item} day={day} dimmed={dimmed} />;
            case "holiday":
              return <HolidayRow key={item.id} item={item} day={day} dimmed={dimmed} />;
            case "journal":
              return <JournalRow key={item.id} item={item} day={day} dimmed={dimmed} />;
          }
        })}
      </ul>
    </li>
  );
}

/** Le jour, à gauche du fil, en face du premier élément de la date. */
function DayGutter({ day }: { day: number | null }) {
  if (day === null) return null;
  return (
    <span
      className="absolute right-[calc(100%+2.5rem)] top-0 text-base font-semibold leading-5 tabular-nums text-foreground"
      data-testid="timeline-day"
      aria-hidden
    >
      {day}
    </span>
  );
}

function RoomRow({
  item,
  day,
  fullDate,
  opener,
  arc,
  rank,
  dimmed,
  onClick,
}: {
  item: TimelineRoomItem;
  day: number | null;
  fullDate: string;
  opener: TimelineOpener | null;
  arc: TimelineArc | null;
  /** Son rang dans l'arc (1, 2, 3…). */
  rank: number | null;
  dimmed: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("worlds");
  const tv = useTranslations("worlds.timelineView");
  const { status } = item;
  return (
    <li
      className={cn("group/room relative transition-opacity", dimmed && "opacity-30")}
      data-room-id={item.id}
      data-status={status}
    >
      <DayGutter day={day} />
      {/* Un anneau par salon, sur le fil, centré sur son titre (ligne de
          20px), à la couleur de son arc ; il fonce au survol. Son remplissage
          dit le statut : creux en cours, un quart plein en sommeil, plein
          terminé, en pointillés abandonné. */}
      <span
        className={cn(
          "absolute -left-[33.5px] top-1 size-3 rounded-full border-[1.5px] transition-colors",
          !arc && "border-foreground/35 text-foreground/35 group-hover/room:border-foreground group-hover/room:text-foreground",
          status === "abandoned" && "border-dashed",
          status === "completed" && !arc ? "bg-foreground/35 group-hover/room:bg-foreground" : status !== "completed" && AMBIENT_BG,
        )}
        style={{
          ...(arc ? { borderColor: arc.color } : {}),
          ...(status === "completed" && arc ? { backgroundColor: arc.color } : {}),
          ...(status === "dormant" ? { backgroundImage: `conic-gradient(${arc?.color ?? "currentColor"} 0 25%, transparent 0)` } : {}),
        }}
        data-testid="timeline-ring"
        aria-hidden
      />
      <button
        type="button"
        onClick={onClick}
        aria-label={[
          item.title,
          opener && openerText(opener, (name) => t("timelineByName", { name })),
          arc && (rank ? tv("arcEpisode", { name: arc.name, rank }) : tv("arcOf", { name: arc.name })),
          status !== "active" && tv(`roomStatus.${status}`),
          fullDate,
        ]
          .filter(Boolean)
          .join(", ")}
        // Un bloc sur une ligne de 20px : en ligne (`inline-block`), le bouton
        // héritait de la hauteur de ligne du parent et le titre glissait.
        className="group/title ml-[var(--tl-graph-pad,0px)] block max-w-full rounded-md text-left text-sm leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-title-start
      >
        {/* Au survol, le titre s’éclaircit seulement (atténué au repos) : pas de fond. */}
        <span className="min-w-0 break-words">
          {/* Le rang dans l'arc, à la couleur de l'arc, juste avant le titre. */}
          {arc && rank && (
            <span
              className="mr-1 text-sm font-semibold tabular-nums"
              style={{ color: arc.color }}
              data-testid="timeline-arc-rank"
              aria-hidden
            >
              {rank}.
            </span>
          )}
          <span
            className={cn(
              "text-sm font-medium transition-colors group-hover/room:text-foreground",
              status === "abandoned" ? "text-foreground/40" : "text-foreground/75",
            )}
          >
            {item.title}
          </span>
          {/* « par Persona (@pseudo) » : le persona dans la couleur de son
              groupe, le pseudo du joueur entre parenthèses ; « par @pseudo »
              quand le salon n'a pas encore de message. */}
          {opener && (
            <span className="ml-1.5 text-xs text-muted-foreground" data-testid="timeline-opener" aria-hidden>
              {t.rich("timelineBy", {
                name: opener.persona ?? `@${opener.name}`,
                author: (chunks) => (
                  <span
                    className={cn("font-medium", !(opener.persona && opener.personaColor) && "text-foreground/75")}
                    style={opener.persona && opener.personaColor ? { color: opener.personaColor } : undefined}
                  >
                    {chunks}
                  </span>
                ),
              })}
              {opener.persona && ` (@${opener.name})`}
            </span>
          )}
          {arc && (
            <span
              className="ml-2 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: arc.color }}
              data-testid="timeline-arc"
              aria-hidden
            >
              {arc.name}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function EventRow({
  item,
  day,
  canManage,
  dimmed,
  onOpenWiki,
  onEdit,
}: {
  item: TimelineEvent;
  day: number | null;
  canManage: boolean;
  dimmed: boolean;
  onOpenWiki: (slug: string) => void;
  onEdit: () => void;
}) {
  const tv = useTranslations("worlds.timelineView");
  return (
    <li className={cn("group/event relative transition-opacity", dimmed && "opacity-30")} data-event-id={item.id}>
      <DayGutter day={day} />
      {/* Un losange plein sur le fil : un jalon du monde, pas un salon. */}
      <span
        className="absolute -left-[32px] top-[5px] size-2.5 rotate-45 bg-foreground"
        data-testid="timeline-event-mark"
        aria-hidden
      />
      <div className="ml-[var(--tl-graph-pad,0px)] flex items-start gap-2" data-title-start>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5 text-foreground">
            <span className="sr-only">{tv("eventLabel")} : </span>
            {item.title}
          </p>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{item.description}</p>
          )}
          {item.wikiPage && (
            <button
              type="button"
              onClick={() => onOpenWiki(item.wikiPage!.slug)}
              className="mt-1 inline-flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BookOpen className="h-3 w-3" aria-hidden />
              {item.wikiPage.title}
            </button>
          )}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={tv("editEventNamed", { title: item.title })}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/event:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

/** La fin d'un événement qui dure : un losange creux, « Fin : … ». */
function EventEndRow({ item, day, dimmed }: { item: TimelineEventEndItem; day: number | null; dimmed: boolean }) {
  const tv = useTranslations("worlds.timelineView");
  return (
    <li className={cn("relative transition-opacity", dimmed && "opacity-30")} data-event-end-id={item.eventId}>
      <DayGutter day={day} />
      <span
        className={cn("absolute -left-[32px] top-[5px] size-2.5 rotate-45 border-[1.5px] border-foreground/60", AMBIENT_BG)}
        data-testid="timeline-event-end-mark"
        aria-hidden
      />
      <p className="ml-[var(--tl-graph-pad,0px)] text-xs leading-5 text-muted-foreground" data-title-start>
        {tv("eventEnds", { title: item.title })}
      </p>
    </li>
  );
}

/** Une fête du calendrier : une étincelle sur le fil, son nom en retrait. */
function HolidayRow({ item, day, dimmed }: { item: TimelineHolidayItem; day: number | null; dimmed: boolean }) {
  const tv = useTranslations("worlds.timelineView");
  return (
    <li className={cn("relative transition-opacity", dimmed && "opacity-30")} data-holiday-id={item.id}>
      <DayGutter day={day} />
      <Sparkles
        className={cn("absolute -left-[34px] top-1 size-3 rounded-full text-muted-foreground", AMBIENT_BG)}
        data-testid="timeline-holiday-mark"
        aria-hidden
      />
      <p className="ml-[var(--tl-graph-pad,0px)] text-xs italic leading-5 text-muted-foreground">
        <span className="sr-only">{tv("holidayLabel")} : </span>
        {item.name}
      </p>
    </li>
  );
}

function JournalRow({ item, day, dimmed }: { item: TimelineJournalItem; day: number | null; dimmed: boolean }) {
  const tv = useTranslations("worlds.timelineView");
  const [expanded, setExpanded] = useState(false);
  return (
    <li className={cn("relative transition-opacity", dimmed && "opacity-30")} data-journal-id={item.id}>
      <DayGutter day={day} />
      {/* Un point discret : une trace de personnage, pas un salon. */}
      <span className="absolute -left-[31px] top-[7px] size-1.5 rounded-full bg-muted-foreground/60" aria-hidden />
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="ml-[var(--tl-graph-pad,0px)] block max-w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-1 text-xs leading-5 text-muted-foreground">
          <BookText className="h-3 w-3" aria-hidden />
          {tv("journalOf", { name: item.personaName })}
        </span>
        <span className={cn("block whitespace-pre-line text-xs italic text-foreground/70", !expanded && "line-clamp-2")}>
          {item.body}
        </span>
      </button>
    </li>
  );
}
