import type { WorldTimelineAge, WorldTimelineDate } from "@/types/worlds";

/**
 * Ce que montre la frise d'un monde (voir WorldTimeline.tsx) : ses salons,
 * ses événements (des jalons sans salon, migration 193) et, si le monde le
 * veut, les entrées datées des journaux de personas. Tout se range par année,
 * puis par date (mois, jour) ; dans une même date, l'événement d'abord, puis
 * les salons, puis les journaux.
 */

export type TimelineRoomItem = {
  kind: "room";
  id: string;
  date: WorldTimelineDate;
  title: string;
  arcId: string | null;
  previousId: string | null;
  categoryId: string | null;
};
export type TimelineEventItem = {
  kind: "event";
  id: string;
  date: WorldTimelineDate;
  title: string;
  description: string | null;
  wikiPageId: string | null;
};
export type TimelineJournalItem = {
  kind: "journal";
  id: string;
  date: WorldTimelineDate;
  personaId: string;
  personaName: string;
  body: string;
};
export type TimelineItem = TimelineRoomItem | TimelineEventItem | TimelineJournalItem;
export type TimelineItemKind = TimelineItem["kind"];

export const TIMELINE_ITEM_KINDS: readonly TimelineItemKind[] = ["event", "room", "journal"];

export type TimelineDateGroup = { key: string; month: number | null; day: number | null; items: TimelineItem[] };
export type TimelineYearSection = { year: number; groups: TimelineDateGroup[] };

const KIND_ORDER: Record<TimelineItemKind, number> = { event: 0, room: 1, journal: 2 };

function compareItems(a: TimelineItem, b: TimelineItem): number {
  return (
    a.date.year - b.date.year ||
    (a.date.month ?? -1) - (b.date.month ?? -1) ||
    (a.date.day ?? 0) - (b.date.day ?? 0) ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
  );
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

// ── Filtres et recherche ─────────────────────────────────────

export type TimelineFilters = {
  query: string;
  kinds: ReadonlySet<TimelineItemKind>;
  personaId: string | null;
  player: string | null;
  arcId: string | null;
  categoryId: string | null;
};

export const NO_TIMELINE_FILTERS: TimelineFilters = {
  query: "",
  kinds: new Set(TIMELINE_ITEM_KINDS),
  personaId: null,
  player: null,
  arcId: null,
  categoryId: null,
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
    (f.personaId ? 1 : 0) + (f.player ? 1 : 0) + (f.arcId ? 1 : 0) + (f.categoryId ? 1 : 0)
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
    case "journal":
      return `${item.personaName} ${item.body}`;
  }
}

/**
 * Un élément passe-t-il les filtres ? Les événements sont le contexte du
 * monde : les filtres propres aux salons (persona, joueur, arc, catégorie)
 * ne les masquent pas, seuls le type et la recherche le font. Un journal suit
 * le filtre par persona ; les filtres de salon (joueur, arc, catégorie) le
 * masquent.
 */
export function matchesTimelineFilters(item: TimelineItem, f: TimelineFilters, ctx: TimelineRoomContext): boolean {
  if (!f.kinds.has(item.kind)) return false;
  const q = normalizeSearch(f.query);
  if (q && !normalizeSearch(searchText(item, ctx)).includes(q)) return false;
  if (item.kind === "event") return true;
  if (item.kind === "journal") {
    if (f.player || f.arcId || f.categoryId) return false;
    return !f.personaId || item.personaId === f.personaId;
  }
  if (f.personaId && !ctx.personas.get(item.id)?.has(f.personaId)) return false;
  if (f.player && ctx.openers.get(item.id)?.name !== f.player) return false;
  if (f.arcId && item.arcId !== f.arcId) return false;
  if (f.categoryId && item.categoryId !== f.categoryId) return false;
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
