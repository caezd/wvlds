import type { WorldTimelineAge, WorldTimelineDate, WorldTimelineHoliday } from "@/types/worlds";

/**
 * Ce que montre la frise d'un monde (voir WorldTimeline.tsx) : ses salons,
 * ses événements (des jalons sans salon, migration 193 ; qui peuvent durer,
 * migration 197), les fêtes de son calendrier et, si le monde le veut, les
 * entrées datées des journaux de personas. Tout se range par année, puis par
 * date (mois, jour) ; dans une même date, la fête d'abord, puis l'événement,
 * les salons, les journaux, et enfin la fin des événements qui s'achèvent.
 */

/**
 * Le statut d'un salon sur la frise : en cours, terminé ou abandonné, tel
 * qu'enregistré (migration 197) ; « en sommeil », déduit : un salon en cours
 * sans message depuis un moment (voir `effectiveRoomStatus`).
 */
export type TimelineRoomStatus = "active" | "dormant" | "completed" | "abandoned";
export const TIMELINE_ROOM_STATUSES: readonly TimelineRoomStatus[] = ["active", "dormant", "completed", "abandoned"];
/** Sans réglage du monde, un salon s'endort après 30 jours sans message. */
export const DEFAULT_DORMANT_DAYS = 30;

export type TimelineRoomItem = {
  kind: "room";
  id: string;
  date: WorldTimelineDate;
  title: string;
  arcId: string | null;
  /** Les salons qu'il suit (liens acceptés ou proposés, migration 194). */
  previousIds: readonly string[];
  categoryId: string | null;
  status: TimelineRoomStatus;
};
export type TimelineEventItem = {
  kind: "event";
  id: string;
  date: WorldTimelineDate;
  /** Un événement qui dure : sa fin, après son début. */
  endDate: WorldTimelineDate | null;
  title: string;
  description: string | null;
  wikiPageId: string | null;
};
/** La fin d'un événement qui dure, à sa date de fin. */
export type TimelineEventEndItem = {
  kind: "eventEnd";
  id: string;
  eventId: string;
  date: WorldTimelineDate;
  title: string;
};
/** Une fête du calendrier du monde, rappelée à sa date une année donnée. */
export type TimelineHolidayItem = {
  kind: "holiday";
  id: string;
  date: WorldTimelineDate;
  name: string;
};
export type TimelineJournalItem = {
  kind: "journal";
  id: string;
  date: WorldTimelineDate;
  personaId: string;
  personaName: string;
  body: string;
};
export type TimelineItem =
  | TimelineRoomItem
  | TimelineEventItem
  | TimelineEventEndItem
  | TimelineHolidayItem
  | TimelineJournalItem;
export type TimelineItemKind = TimelineItem["kind"];

/** Ce que les filtres montrent ou cachent : la fin d'un événement suit l'événement. */
export type TimelineFilterKind = Exclude<TimelineItemKind, "eventEnd">;
export const TIMELINE_ITEM_KINDS: readonly TimelineFilterKind[] = ["event", "room", "journal", "holiday"];

function filterKindOf(item: TimelineItem): TimelineFilterKind {
  return item.kind === "eventEnd" ? "event" : item.kind;
}

export type TimelineDateGroup = { key: string; month: number | null; day: number | null; items: TimelineItem[] };
export type TimelineYearSection = { year: number; groups: TimelineDateGroup[] };

const KIND_ORDER: Record<TimelineItemKind, number> = { holiday: 0, event: 1, room: 2, journal: 3, eventEnd: 4 };

/** L'ordre de la frise : l'année, puis le mois (sans mois d'abord), puis le jour. */
function compareDates(a: WorldTimelineDate, b: WorldTimelineDate): number {
  return a.year - b.year || (a.month ?? -1) - (b.month ?? -1) || (a.day ?? 0) - (b.day ?? 0);
}

function compareItems(a: TimelineItem, b: TimelineItem): number {
  return compareDates(a.date, b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
}

/**
 * La fin de chaque événement qui dure, à placer sur la frise. Une fin qui
 * ne vient pas après le début, dans l'ordre de la frise, ne s'affiche pas.
 */
export function eventEndItems(events: readonly TimelineEventItem[]): TimelineEventEndItem[] {
  return events
    .filter((e) => e.endDate && compareDates(e.endDate, e.date) > 0)
    .map((e) => ({ kind: "eventEnd", id: `${e.id}:end`, eventId: e.id, date: e.endDate!, title: e.title }));
}

/**
 * Les fêtes du calendrier, rappelées dans les mois donnés (ceux qui ont déjà
 * une entrée : une fête seule ne crée ni mois ni année). Une fête sans nom,
 * ou dont le mois n'existe pas au calendrier, est ignorée.
 */
export function holidayItems(
  holidays: readonly WorldTimelineHoliday[] | undefined,
  months: readonly { year: number; month: number }[],
  monthCount: number,
): TimelineHolidayItem[] {
  const valid = (holidays ?? [])
    .map((h, i) => ({ ...h, i }))
    .filter((h) => h.name.trim() !== "" && h.month >= 0 && h.month < monthCount);
  const seen = new Set<string>();
  return months.flatMap(({ year, month }) => {
    const key = `${year}:${month}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return valid
      .filter((h) => h.month === month)
      .map((h) => ({
        kind: "holiday" as const,
        id: `holiday:${h.i}:${year}`,
        date: { year, month, day: h.day },
        name: h.name.trim(),
      }));
  });
}

/** Une fête à venir : sa prochaine date, et dans combien de mois du monde. */
export type UpcomingHoliday = { name: string; year: number; month: number; day: number | null; monthsAway: number };

/**
 * Les prochaines fêtes du calendrier, à partir de la date actuelle du monde
 * (`current_year`, `current_month` ; sans mois, le premier). Le monde n'a pas
 * de jour courant : une fête du mois en cours est « ce mois-ci » (0 mois),
 * qu'elle soit déjà passée ou non. Triées par éloignement, puis par jour.
 */
export function upcomingHolidays(
  holidays: readonly WorldTimelineHoliday[] | undefined,
  current: { year: number; month: number | null },
  monthCount: number,
  limit: number,
): UpcomingHoliday[] {
  if (monthCount <= 0) return [];
  const now = Math.min(Math.max(current.month ?? 0, 0), monthCount - 1);
  return (holidays ?? [])
    .filter((h) => h.name.trim() !== "" && h.month >= 0 && h.month < monthCount)
    .map((h) => ({
      name: h.name.trim(),
      month: h.month,
      day: h.day,
      year: current.year + (h.month < now ? 1 : 0),
      monthsAway: (h.month - now + monthCount) % monthCount,
    }))
    .sort((a, b) => a.monthsAway - b.monthsAway || (a.day ?? 0) - (b.day ?? 0))
    .slice(0, Math.max(0, limit));
}

/**
 * Le statut d'un salon sur la frise : terminé ou abandonné, tel quel ; en
 * cours, il s'endort sans message depuis `dormantDays` jours (0 : jamais).
 * Sans message, on compte depuis sa création.
 */
export function effectiveRoomStatus(
  stored: "active" | "completed" | "abandoned",
  lastActivity: string | null,
  dormantDays: number,
  now: number,
): TimelineRoomStatus {
  if (stored !== "active") return stored;
  if (dormantDays <= 0 || !lastActivity) return "active";
  const idle = now - new Date(lastActivity).getTime();
  return idle > dormantDays * 86_400_000 ? "dormant" : "active";
}

/**
 * Une section par année, un groupe par date. `keepYear` garde une année même
 * vide — celle de la date actuelle du monde, qui porte son repère.
 */
export function buildTimelineSections(items: TimelineItem[], keepYear: number | null): TimelineYearSection[] {
  const sorted = [...items].sort(compareItems);
  const sections: TimelineYearSection[] = [];
  for (const item of sorted) {
    let section = sections[sections.length - 1];
    if (!section || section.year !== item.date.year) {
      section = { year: item.date.year, groups: [] };
      sections.push(section);
    }
    const last = section.groups[section.groups.length - 1];
    if (last && last.month === item.date.month && last.day === item.date.day) last.items.push(item);
    else section.groups.push({ key: `${item.date.month ?? ""}:${item.date.day ?? ""}`, month: item.date.month, day: item.date.day, items: [item] });
  }
  if (keepYear !== null && sections.length > 0 && !sections.some((s) => s.year === keepYear)) {
    sections.push({ year: keepYear, groups: [] });
    sections.sort((a, b) => a.year - b.year);
  }
  return sections;
}

// ── Pagination de l'affichage ────────────────────────────────

/**
 * La frise ne rend qu'une fenêtre de ses dates, étendue au défilement (vers
 * le haut comme vers le bas : elle s'ouvre sur l'année actuelle). Les filtres,
 * la recherche, les rangs d'arc et les suites portent toujours sur toute la
 * frise ; seul l'affichage est paginé.
 *
 * Une « ligne » de la fenêtre est une date (un groupe) ; une année sans date
 * (l'année actuelle, gardée vide pour son repère) compte pour une ligne, pour
 * rester atteignable.
 */
export const TIMELINE_PAGE = 60;

export type TimelineWindow = { start: number; end: number };

/** Le nombre de lignes de la frise. */
export function timelineRowCount(sections: readonly TimelineYearSection[]): number {
  return sections.reduce((n, s) => n + Math.max(1, s.groups.length), 0);
}

/** La première ligne d'une année ; -1 si l'année n'est pas sur la frise. */
export function timelineRowOfYear(sections: readonly TimelineYearSection[], year: number): number {
  let row = 0;
  for (const s of sections) {
    if (s.year === year) return row;
    row += Math.max(1, s.groups.length);
  }
  return -1;
}

/**
 * La fenêtre d'ouverture : autour de l'année donnée (quelques lignes avant
 * elle, pour pouvoir remonter un peu, puis une page), ou depuis le début si
 * elle n'est pas sur la frise.
 */
export function initialTimelineWindow(
  sections: readonly TimelineYearSection[],
  year: number,
  page = TIMELINE_PAGE,
): TimelineWindow {
  const total = timelineRowCount(sections);
  const row = timelineRowOfYear(sections, year);
  const start = row < 0 ? 0 : Math.max(0, row - Math.floor(page / 6));
  return { start, end: Math.min(total, start + page) };
}

/**
 * Les sections restreintes à la fenêtre : une année à cheval garde ses dates
 * de la fenêtre seulement ; une année sans date y figure si sa ligne y est.
 */
export function sliceTimelineSections(
  sections: readonly TimelineYearSection[],
  window: TimelineWindow,
): TimelineYearSection[] {
  const out: TimelineYearSection[] = [];
  let row = 0;
  for (const s of sections) {
    const rows = Math.max(1, s.groups.length);
    const from = Math.max(window.start, row);
    const to = Math.min(window.end, row + rows);
    if (from < to) {
      out.push(s.groups.length === 0 ? s : { year: s.year, groups: s.groups.slice(from - row, to - row) });
    }
    row += rows;
  }
  return out;
}

/** La ligne de chaque élément de la frise (pour savoir s'il est dans la fenêtre). */
export function timelineRowsById(sections: readonly TimelineYearSection[]): Map<string, number> {
  const rows = new Map<string, number>();
  let row = 0;
  for (const s of sections) {
    s.groups.forEach((g, i) => {
      for (const item of g.items) rows.set(item.id, row + i);
    });
    row += Math.max(1, s.groups.length);
  }
  return rows;
}

// ── Filtres et recherche ─────────────────────────────────────

export type TimelineFilters = {
  query: string;
  kinds: ReadonlySet<TimelineFilterKind>;
  personaId: string | null;
  player: string | null;
  arcId: string | null;
  categoryId: string | null;
  status: TimelineRoomStatus | null;
};

export const NO_TIMELINE_FILTERS: TimelineFilters = {
  query: "",
  kinds: new Set(TIMELINE_ITEM_KINDS),
  personaId: null,
  player: null,
  arcId: null,
  categoryId: null,
  status: null,
};

/** Ce que la frise sait de chaque salon, au-delà de sa ligne. */
export type TimelineRoomContext = {
  /** Les personas qui y ont écrit (migration 193, `get_chatroom_personas`). */
  personas: ReadonlyMap<string, ReadonlySet<string>>;
  /** Qui l'a ouvert (migration 192) : pseudo et persona. */
  openers: ReadonlyMap<string, { name: string; persona: string | null }>;
};

/** Minuscules, sans accents : « Écho » se trouve en tapant « echo ». */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function countActiveFilters(f: TimelineFilters): number {
  return (
    (f.kinds.size < TIMELINE_ITEM_KINDS.length ? 1 : 0) +
    (f.personaId ? 1 : 0) + (f.player ? 1 : 0) + (f.arcId ? 1 : 0) + (f.categoryId ? 1 : 0) + (f.status ? 1 : 0)
  );
}

export function isFiltering(f: TimelineFilters): boolean {
  return normalizeSearch(f.query) !== "" || countActiveFilters(f) > 0;
}

function searchText(item: TimelineItem, ctx: TimelineRoomContext): string {
  switch (item.kind) {
    case "room": {
      const o = ctx.openers.get(item.id);
      return [item.title, o?.name, o?.persona].filter(Boolean).join(" ");
    }
    case "event":
      return [item.title, item.description].filter(Boolean).join(" ");
    case "eventEnd":
      return item.title;
    case "holiday":
      return item.name;
    case "journal":
      return `${item.personaName} ${item.body}`;
  }
}

/**
 * Un élément passe-t-il les filtres ? Les événements (et leur fin) et les
 * fêtes sont le contexte du monde : les filtres propres aux salons (persona,
 * joueur, arc, catégorie, statut) ne les masquent pas, seuls le type et la
 * recherche le font. Un journal suit le filtre par persona ; les filtres de
 * salon (joueur, arc, catégorie, statut) le masquent.
 */
export function matchesTimelineFilters(item: TimelineItem, f: TimelineFilters, ctx: TimelineRoomContext): boolean {
  if (!f.kinds.has(filterKindOf(item))) return false;
  const q = normalizeSearch(f.query);
  if (q && !normalizeSearch(searchText(item, ctx)).includes(q)) return false;
  if (item.kind === "event" || item.kind === "eventEnd" || item.kind === "holiday") return true;
  if (item.kind === "journal") {
    if (f.player || f.arcId || f.categoryId || f.status) return false;
    return !f.personaId || item.personaId === f.personaId;
  }
  if (f.personaId && !ctx.personas.get(item.id)?.has(f.personaId)) return false;
  if (f.player && ctx.openers.get(item.id)?.name !== f.player) return false;
  if (f.arcId && item.arcId !== f.arcId) return false;
  if (f.categoryId && item.categoryId !== f.categoryId) return false;
  if (f.status && item.status !== f.status) return false;
  return true;
}

// ── Saisons et périodes ──────────────────────────────────────

/** Les saisons triées, chacune bornée : sans fin, elle court jusqu'à la suivante. */
export function normalizeAges(ages: readonly WorldTimelineAge[] | undefined): WorldTimelineAge[] {
  const sorted = [...(ages ?? [])]
    .filter((a) => a.name.trim() !== "" && Number.isFinite(a.from_year))
    .sort((a, b) => a.from_year - b.from_year);
  return sorted.map((a, i) => {
    const next = sorted[i + 1];
    const cap = next ? next.from_year - 1 : null;
    const to = a.to_year === null ? cap : cap === null ? a.to_year : Math.min(a.to_year, cap);
    return { name: a.name.trim(), from_year: a.from_year, to_year: to };
  });
}

export function ageOf(ages: readonly WorldTimelineAge[], year: number): WorldTimelineAge | null {
  return ages.find((a) => year >= a.from_year && (a.to_year === null || year <= a.to_year)) ?? null;
}

export type TimelinePeriod = { key: string; label: string; firstYear: number; age: WorldTimelineAge | null };

/**
 * Les pastilles de tête : une par saison présente, et, pour les années hors
 * saison, une par tranche de `span` années (comptées depuis la première).
 */
export function buildTimelinePeriods(
  years: readonly number[],
  ages: readonly WorldTimelineAge[],
  span = 5,
): { periods: TimelinePeriod[]; periodOf: (year: number) => string } {
  const base = years.length ? Math.min(...years) : 0;
  const keyOf = (year: number): { key: string; label: string; age: WorldTimelineAge | null } => {
    const age = ageOf(ages, year);
    if (age) return { key: `age:${age.from_year}`, label: age.name, age };
    const chunk = Math.floor((year - base) / span);
    const start = base + chunk * span;
    return { key: `auto:${chunk}`, label: `${start} – ${start + span - 1}`, age: null };
  };
  const periods: TimelinePeriod[] = [];
  for (const year of [...years].sort((a, b) => a - b)) {
    const k = keyOf(year);
    if (!periods.some((p) => p.key === k.key)) periods.push({ ...k, firstYear: year });
  }
  return { periods, periodOf: (year) => keyOf(year).key };
}

// ── Lignes de suite ──────────────────────────────────────────

/**
 * Chaque ligne de suite occupe un couloir de la marge droite ; deux lignes
 * dont les hauteurs se chevauchent n'en partagent pas. Attribution gloutonne
 * par haut croissant : le premier couloir libre.
 */
export function assignSuiteLanes(spans: readonly { top: number; bottom: number }[]): number[] {
  const order = spans.map((s, i) => ({ ...s, i })).sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(spans.length).fill(0);
  for (const s of order) {
    let lane = laneEnds.findIndex((end) => end < s.top);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.bottom);
    } else {
      laneEnds[lane] = s.bottom;
    }
    lanes[s.i] = lane;
  }
  return lanes;
}

// ── Chaînes de suites ────────────────────────────────────────

/**
 * Un lien de suite : `to` suit `from`. Proposé (`pending`), il se trace en
 * pointillés. Entre deux arcs différents, c'est une passerelle : `bridgeFrom`
 * porte la couleur de l'arc quitté, `color` celle de l'arc rejoint.
 */
export type SuitePair = {
  from: string;
  to: string;
  color: string | null;
  pending?: boolean;
  bridgeFrom?: string | null;
};
export type SuiteChain = { ids: string[]; color: string | null };

/** Une passerelle relie deux arcs sans les fondre en une chaîne. */
export function isSuiteBridge(pair: SuitePair): boolean {
  return pair.bridgeFrom !== undefined;
}

/**
 * Les suites forment des chaînes (A → B → C) ; les styles « rail » et
 * « graphe » dessinent une chaîne d'un seul trait, pas une accolade par
 * paire. Deux paires qui partagent un salon sont de la même chaîne. La
 * couleur est celle de la première paire colorée (l'arc de la suite).
 * Les passerelles entre arcs sont écartées : chaque arc garde sa chaîne et
 * sa couleur (SuiteLinks les trace à part).
 */
export function buildSuiteChains(allPairs: readonly SuitePair[]): SuiteChain[] {
  const pairs = allPairs.filter((p) => !isSuiteBridge(p));
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  for (const p of pairs) {
    for (const id of [p.from, p.to]) if (!parent.has(id)) parent.set(id, id);
    const a = find(p.from);
    const b = find(p.to);
    if (a !== b) parent.set(b, a);
  }
  const chains = new Map<string, SuiteChain>();
  for (const p of pairs) {
    const root = find(p.from);
    if (!chains.has(root)) chains.set(root, { ids: [], color: null });
    const chain = chains.get(root)!;
    for (const id of [p.from, p.to]) if (!chain.ids.includes(id)) chain.ids.push(id);
    if (!chain.color && p.color) chain.color = p.color;
  }
  return [...chains.values()];
}

/** Les salons de la chaîne d'un salon, lui compris ; `null` s'il n'en a pas. */
export function suiteChainOf(pairs: readonly SuitePair[], id: string): ReadonlySet<string> | null {
  const chain = buildSuiteChains(pairs).find((c) => c.ids.includes(id));
  return chain ? new Set(chain.ids) : null;
}

// ── Rang dans un arc ─────────────────────────────────────────

/**
 * Le rang de chaque salon dans son arc (1, 2, 3…), dans l'ordre du récit :
 * par date ; à date égale, la suite après le salon qu'elle suit, puis par
 * titre. À calculer sur tous les salons, pas sur ceux qu'un filtre laisse :
 * le rang d'un salon ne change pas quand on filtre.
 */
export function arcRanks(items: readonly TimelineItem[]): Map<string, number> {
  const byArc = new Map<string, TimelineRoomItem[]>();
  for (const item of items) {
    if (item.kind !== "room" || !item.arcId) continue;
    if (!byArc.has(item.arcId)) byArc.set(item.arcId, []);
    byArc.get(item.arcId)!.push(item);
  }
  const ranks = new Map<string, number>();
  for (const rooms of byArc.values()) {
    rooms.sort((a, b) =>
      a.date.year - b.date.year ||
      (a.date.month ?? -1) - (b.date.month ?? -1) ||
      (a.date.day ?? 0) - (b.date.day ?? 0) ||
      (a.previousIds.includes(b.id) ? 1 : b.previousIds.includes(a.id) ? -1 : 0) ||
      a.title.localeCompare(b.title),
    );
    rooms.forEach((room, i) => ranks.set(room.id, i + 1));
  }
  return ranks;
}

// ── Arcs en cours pendant un événement ───────────────────────

/**
 * Les arcs que chaque événement traverse : ceux dont les salons, du premier
 * au dernier, chevauchent sa période (du début à la fin s'il dure, sa seule
 * date sinon). Dans l'ordre des arcs donnés. À calculer sur tous les salons,
 * pas sur ceux qu'un filtre laisse.
 */
export function eventArcIds(
  items: readonly TimelineItem[],
  arcOrder: readonly string[],
): Map<string, string[]> {
  const spans = new Map<string, { start: WorldTimelineDate; end: WorldTimelineDate }>();
  for (const item of items) {
    if (item.kind !== "room" || !item.arcId) continue;
    const span = spans.get(item.arcId);
    if (!span) spans.set(item.arcId, { start: item.date, end: item.date });
    else {
      if (compareDates(item.date, span.start) < 0) span.start = item.date;
      if (compareDates(item.date, span.end) > 0) span.end = item.date;
    }
  }
  const result = new Map<string, string[]>();
  for (const item of items) {
    if (item.kind !== "event") continue;
    const end = item.endDate && compareDates(item.endDate, item.date) > 0 ? item.endDate : item.date;
    const ids = arcOrder.filter((id) => {
      const span = spans.get(id);
      return !!span && compareDates(span.start, end) <= 0 && compareDates(span.end, item.date) >= 0;
    });
    if (ids.length > 0) result.set(item.id, ids);
  }
  return result;
}
