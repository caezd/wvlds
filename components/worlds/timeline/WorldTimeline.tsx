"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { BookOpen, BookText, Clock, Pencil, Plus, Search, Spline } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimelineLabel } from "@/lib/worldTimeline";
import {
  NO_TIMELINE_FILTERS,
  ageOf,
  arcRanks,
  buildTimelinePeriods,
  buildTimelineSections,
  matchesTimelineFilters,
  normalizeAges,
  suiteChainOf,
  type TimelineDateGroup,
  type TimelineFilters,
  type TimelineItem,
  type TimelineJournalItem,
  type TimelineRoomContext,
  type TimelineRoomItem,
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
import { TimelineArcsDialog } from "@/components/worlds/timeline/TimelineArcsDialog";
import { TimelineEventDialog } from "@/components/worlds/timeline/TimelineEventDialog";
import { TimelineFiltersPopover } from "@/components/worlds/timeline/TimelineFiltersPopover";
import { TimelineSequelRequests, type SequelRequest } from "@/components/worlds/timeline/TimelineSequelRequests";
import {
  useTimelineData,
  type TimelineArc,
  type TimelineEvent,
  type TimelineOpener,
} from "@/components/worlds/timeline/useTimelineData";
import type { WorldTimelineAge, WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

type TimelineRoom = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  timeline_date: WorldTimelineDate | null;
};

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
 */
export function WorldTimeline({
  worldId,
  rooms,
  config,
  canManage = false,
  canManageLinks = false,
}: {
  worldId: string;
  rooms: TimelineRoom[];
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
  const listRef = useRef<HTMLDivElement>(null);
  const data = useTimelineData(worldId, !!config.show_journals);

  const [filters, setFilters] = useState<TimelineFilters>(NO_TIMELINE_FILTERS);
  const [eventDialog, setEventDialog] = useState<{ open: boolean; event: TimelineEvent | null }>({ open: false, event: null });
  const [arcsOpen, setArcsOpen] = useState(false);
  const [lanes, setLanes] = useState(0);
  const [suiteStyle, setSuiteStyleState] = useState<SuiteStyle>("rail");
  const [hoverOnly, setHoverOnlyState] = useState(false);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
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

  const allItems: TimelineItem[] = useMemo(() => {
    const roomItems: TimelineRoomItem[] = rooms
      .filter((r) => r.timeline_date !== null)
      .map((r) => {
        const meta = data.roomMeta.get(r.id);
        return {
          kind: "room",
          id: r.id,
          date: r.timeline_date!,
          title: r.title ?? r.name ?? t("timelineUntitled"),
          arcId: meta?.arcId ?? null,
          previousIds: previousOf.get(r.id) ?? [],
          categoryId: meta?.categoryId ?? null,
        };
      });
    return [...roomItems, ...data.events, ...data.journals];
  }, [rooms, data.roomMeta, data.events, data.journals, previousOf, t]);

  // Le rang de chaque salon dans son arc, sur tous les salons : il ne change
  // pas quand on filtre.
  const ranks = useMemo(() => arcRanks(allItems), [allItems]);

  const ctx: TimelineRoomContext = useMemo(
    () => ({ personas: data.roomPersonas, openers: data.openers }),
    [data.roomPersonas, data.openers],
  );
  const visible = useMemo(
    () => allItems.filter((i) => matchesTimelineFilters(i, filters, ctx)),
    [allItems, filters, ctx],
  );

  // L'année actuelle du monde a toujours sa section — sauf si les filtres ne
  // laissent rien : la frise dit alors qu'aucun résultat ne correspond.
  const sections = useMemo(
    () => buildTimelineSections(visible, config.current_year),
    [visible, config.current_year],
  );

  const ages = useMemo(() => normalizeAges(config.ages), [config.ages]);
  const { periods, periodOf } = useMemo(
    () => buildTimelinePeriods(sections.map((s) => s.year), ages),
    [sections, ages],
  );
  const [activePeriod, setActivePeriod] = useState(() => periodOf(config.current_year));

  // Les suites dont les deux salons sont à l'écran. Proposées, elles se
  // tracent en pointillés ; reliées à la chaîne d'un arc, elles en prennent
  // la couleur (voir SuiteLinks).
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
      .map((s) => ({
        from: s.previousId,
        to: s.chatroomId,
        color: colorOf(s.chatroomId) ?? colorOf(s.previousId),
        pending: s.status === "pending",
      }));
  }, [visible, arcsById, data.sequels]);

  // Les suites proposées que l'on peut accepter : accrochées à un salon où
  // l'on joue, ou toutes pour qui gère les salons ou la chronologie.
  const titleOf = useMemo(() => new Map(rooms.map((r) => [r.id, r.title ?? r.name ?? t("timelineUntitled")])), [rooms, t]);
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
  const highlight = useMemo(
    () => (hoverOnly && hoveredRoom ? suiteChainOf(suiteLinks, hoveredRoom) : null),
    [hoverOnly, hoveredRoom, suiteLinks],
  );
  const onlyChain = hoverOnly ? (highlight ?? new Set<string>()) : null;
  const layoutVersion = useMemo(() => `${suiteStyle}:${visible.map((i) => i.id).join(",")}`, [visible, suiteStyle]);
  // Le graphe prend place entre le fil et les titres ; les autres styles, à droite.
  const graphPad = suiteStyle === "graph" && lanes > 0 ? GRAPH_OFFSET + (lanes - 1) * 8 + 10 : 0;
  const rightPad = suiteStyle === "rail" && lanes > 0 ? 20 + 12 + lanes * 10 + 14 : undefined;
  const onLanes = useCallback((n: number) => setLanes(n), []);

  const players = useMemo(
    () => [...new Set([...data.openers.values()].map((o) => o.name))].sort().map((n) => ({ id: n, label: `@${n}` })),
    [data.openers],
  );

  function sectionEl(year: number): HTMLElement | null {
    return scrollRef.current?.querySelector<HTMLElement>(`[data-year="${year}"]`) ?? null;
  }

  function scrollToYear(year: number, smooth: boolean) {
    const el = scrollRef.current;
    const section = sectionEl(year);
    if (!el || !section) return;
    const top = section.offsetTop - (headRef.current?.offsetHeight ?? 0);
    if (typeof el.scrollTo === "function") el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    else el.scrollTop = top;
  }

  // S'ouvrir sur l'année actuelle du monde.
  useEffect(() => {
    scrollToYear(config.current_year, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- à l'ouverture seulement
  }, []);

  // Les périodes suivent le défilement : celle de la dernière année passée
  // sous la tête.
  function onScroll() {
    const el = scrollRef.current;
    if (!el || periods.length < 2) return;
    const seuil = el.getBoundingClientRect().top + (headRef.current?.offsetHeight ?? 0) + 8;
    let current = sections[0]?.year ?? 0;
    for (const s of sections) {
      const node = sectionEl(s.year);
      if (node && node.getBoundingClientRect().top <= seuil) current = s.year;
    }
    setActivePeriod(periodOf(current));
  }

  const nowLabel = t("settings.timelinePreviewLabel");
  const empty = allItems.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorldPanelHeader
        icon={<Clock className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("nav.timeline")}
      />

      {empty && !canManage ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">{t("timelineEmpty")}</p>
      ) : (
        <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 overflow-y-auto" data-testid="timeline-scroll">
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
                personas={data.personas.map((p) => ({ id: p.id, label: p.name }))}
                players={players}
                arcs={data.arcs.map((a) => ({ id: a.id, label: a.name }))}
                categories={data.categories.map((c) => ({ id: c.id, label: c.title }))}
                suiteStyle={suiteStyle}
                onSuiteStyle={setSuiteStyle}
                hoverOnly={hoverOnly}
                onHoverOnly={setHoverOnly}
              />
              <TimelineSequelRequests requests={requests} supabase={data.supabase} onChanged={() => void data.reloadSequels()} />
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

          {empty ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">{t("timelineEmpty")}</p>
          ) : sections.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground" data-testid="timeline-no-match">{tv("noMatch")}</p>
          ) : (
            <div
              ref={listRef}
              className="relative"
              data-suite-style={suiteStyle}
              onMouseOver={(e) => {
                if (!hoverOnly) return;
                const row = (e.target as HTMLElement).closest<HTMLElement>("[data-room-id]");
                setHoveredRoom(row?.dataset.roomId ?? null);
              }}
              onMouseLeave={() => setHoveredRoom(null)}
              onFocus={(e) => {
                if (!hoverOnly) return;
                const row = (e.target as HTMLElement).closest<HTMLElement>("[data-room-id]");
                setHoveredRoom(row?.dataset.roomId ?? null);
              }}
            >
              <ol
                className="px-5 pb-6"
                // Les couloirs des lignes de suite : à droite, ou, pour le
                // graphe, entre le fil et les titres (`--tl-graph-pad`).
                style={{
                  paddingRight: rightPad,
                  ["--tl-graph-pad" as string]: `${graphPad}px`,
                }}
              >
                {sections.map((section, i) => {
                  const age = ageOf(ages, section.year);
                  const prevAge = i > 0 ? ageOf(ages, sections[i - 1].year) : null;
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
              <SuiteLinks containerRef={listRef} links={suiteLinks} style={suiteStyle} only={onlyChain} version={layoutVersion} onLanes={onLanes} />
            </div>
          )}
        </div>
      )}

      {canManage && (
        <>
          <TimelineEventDialog
            open={eventDialog.open}
            onOpenChange={(open) => setEventDialog((d) => ({ ...d, open }))}
            supabase={data.supabase}
            worldId={worldId}
            config={config}
            event={eventDialog.event}
            onSaved={() => void data.reloadEvents()}
          />
          <TimelineArcsDialog
            open={arcsOpen}
            onOpenChange={setArcsOpen}
            supabase={data.supabase}
            worldId={worldId}
            arcs={data.arcs}
            onChanged={() => { void data.reloadArcs(); void data.reloadRooms(); }}
          />
        </>
      )}
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
      <li className="border-t border-border pb-1 pt-6 first:border-t-0 first:pt-2" data-testid="timeline-age">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">{age.name}</p>
        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{bounds}</p>
      </li>
      {children}
    </>
  );
}

function YearBlock({
  section,
  config,
  nowLabel,
  openers,
  arcsById,
  ranks,
  canManage,
  highlight,
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
      showMonth={i === 0}
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

  const caption = `${config.year_label}${config.era_name ? ` ${config.era_name}` : ""}`;

  return (
    <li
      data-year={section.year}
      className="grid grid-cols-[6rem_1fr] border-t border-border first:border-t-0 sm:grid-cols-[9rem_1fr]"
    >
      {/* L'année en très grands chiffres, sa légende en exposant. */}
      <h3 className="flex items-start gap-1 overflow-hidden pt-4 pb-4 pr-3">
        <span className="text-4xl font-semibold leading-[0.85] tracking-tighter tabular-nums sm:text-6xl">
          {section.year}
        </span>
        <span className="text-[11px] font-medium leading-none text-muted-foreground">{caption}</span>
      </h3>
      <div className="relative py-5 pl-7">
        {/* Le fil : d'une section à l'autre, il ne s'interrompt pas. */}
        <span className="absolute inset-y-0 left-0 w-px bg-border" aria-hidden />
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
  showMonth,
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
  /** Le nom du mois au-dessus : seulement pour la première date de l'année,
   *  que n'ouvre aucun filet — ailleurs, le filet le porte déjà. */
  showMonth: boolean;
  onOpenRoom: (id: string) => void;
  onOpenWiki: (slug: string) => void;
  onEditEvent: (id: string) => void;
}) {
  const monthName = group.month !== null ? (config.month_names[group.month] ?? null) : null;
  const fullDate = formatTimelineLabel(config, { year, month: group.month, day: group.day });
  return (
    <li
      className={cn("relative", newMonth && "mt-2 pt-6")}
      data-date-group={group.key}
      data-new-month={newMonth || undefined}
    >
      {/* Le filet d'un nouveau mois, en pointillés, du fil jusqu'au bord, à
          mi-chemin de la date précédente ; le nom du mois posé dessus, en
          petites capitales, dans l'alignement des titres. */}
      {newMonth && (
        <>
          <span className="absolute -left-7 right-0 top-0 border-t border-dashed border-border" aria-hidden />
          {monthName && (
            <span
              className={cn("absolute left-[var(--tl-graph-pad,0px)] top-0 -translate-x-2 -translate-y-1/2 whitespace-nowrap px-2 text-[10px] font-medium uppercase leading-none tracking-wider text-muted-foreground", AMBIENT_BG)}
              data-testid="timeline-month-label"
              aria-hidden
            >
              {monthName}
            </span>
          )}
        </>
      )}
      {showMonth && monthName && (
        <p
          className="mb-2 ml-[var(--tl-graph-pad,0px)] text-[10px] font-medium uppercase leading-none tracking-wider text-muted-foreground"
          data-testid="timeline-first-month"
          aria-hidden
        >
          {monthName}
        </p>
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
  return (
    <li className={cn("group/room relative transition-opacity", dimmed && "opacity-30")} data-room-id={item.id}>
      <DayGutter day={day} />
      {/* Un anneau creux par salon, sur le fil, centré sur son titre (ligne
          de 20px), à la couleur de son arc ; il fonce au survol. */}
      <span
        className={cn(
          "absolute -left-[33.5px] top-1 size-3 rounded-full border-[1.5px] transition-colors",
          !arc && "border-foreground/35 group-hover/room:border-foreground",
          AMBIENT_BG,
        )}
        style={arc ? { borderColor: arc.color } : undefined}
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
          fullDate,
        ]
          .filter(Boolean)
          .join(", ")}
        // Un bloc sur une ligne de 20px : en ligne (`inline-block`), le bouton
        // héritait de la hauteur de ligne du parent et le titre glissait.
        className="group/title ml-[var(--tl-graph-pad,0px)] block max-w-full rounded-md text-left text-sm leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <span className="text-sm font-medium text-foreground/75 transition-colors group-hover/room:text-foreground">
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
      <div className="ml-[var(--tl-graph-pad,0px)] flex items-start gap-2">
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
