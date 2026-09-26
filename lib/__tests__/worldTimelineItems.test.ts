import { describe, it, expect } from "vitest";
import {
  NO_TIMELINE_FILTERS,
  assignSuiteLanes,
  buildTimelinePeriods,
  buildTimelineSections,
  countActiveFilters,
  isFiltering,
  matchesTimelineFilters,
  normalizeAges,
  normalizeSearch,
  type TimelineFilters,
  type TimelineItem,
  type TimelineRoomContext,
} from "@/lib/worldTimelineItems";

const salon = (id: string, year: number, month: number | null, day: number | null, extra: Partial<TimelineItem> = {}): TimelineItem => ({
  kind: "room", id, date: { year, month, day }, title: id, arcId: null, previousIds: [], categoryId: null, ...extra,
} as TimelineItem);
const evenement = (id: string, year: number, month: number | null, day: number | null): TimelineItem => ({
  kind: "event", id, date: { year, month, day }, title: `Événement ${id}`, description: null, wikiPageId: null,
});
const journal = (id: string, personaId: string, year: number, month: number | null, day: number | null): TimelineItem => ({
  kind: "journal", id, date: { year, month, day }, personaId, personaName: "Tess", body: "Une nuit sans lune.",
});

const CTX: TimelineRoomContext = {
  personas: new Map([["a", new Set(["p-tess"])], ["b", new Set(["p-ivo"])]]),
  openers: new Map([["a", { name: "Poumon", persona: "Tess" }], ["b", { name: "Mojkkin", persona: "Ivo" }]]),
};
const filtres = (patch: Partial<TimelineFilters>): TimelineFilters => ({ ...NO_TIMELINE_FILTERS, ...patch });

describe("buildTimelineSections", () => {
  it("par année puis par date ; dans une date, l'événement, les salons, les journaux", () => {
    const sections = buildTimelineSections(
      [journal("j", "p-tess", 1, 2, 9), salon("b", 1, 2, 9), evenement("e", 1, 2, 9), salon("a", 1, 0, 3), salon("c", 3, null, null)],
      null,
    );
    expect(sections.map((s) => s.year)).toEqual([1, 3]);
    expect(sections[0].groups.map((g) => g.key)).toEqual(["0:3", "2:9"]);
    expect(sections[0].groups[1].items.map((i) => i.kind)).toEqual(["event", "room", "journal"]);
  });

  it("garde l'année demandée même vide, à sa place", () => {
    const sections = buildTimelineSections([salon("a", 1, 0, 1), salon("b", 9, 0, 1)], 4);
    expect(sections.map((s) => [s.year, s.groups.length])).toEqual([[1, 1], [4, 0], [9, 1]]);
  });

  it("rien à placer : rien, même pas l'année actuelle", () => {
    expect(buildTimelineSections([], 1)).toEqual([]);
  });
});

describe("filtres et recherche", () => {
  it("la recherche ignore casse et accents, et couvre le persona qui a ouvert le salon", () => {
    expect(normalizeSearch("  Écho ")).toBe("echo");
    expect(matchesTimelineFilters(salon("a", 1, 0, 1), filtres({ query: "tess" }), CTX)).toBe(true);
    expect(matchesTimelineFilters(salon("b", 1, 0, 1), filtres({ query: "tess" }), CTX)).toBe(false);
    expect(matchesTimelineFilters(evenement("x", 1, 0, 1), filtres({ query: "evenement" }), CTX)).toBe(true);
    expect(matchesTimelineFilters(journal("j", "p-tess", 1, 0, 1), filtres({ query: "LUNE" }), CTX)).toBe(true);
  });

  it("par type", () => {
    const seulsSalons = filtres({ kinds: new Set(["room"]) });
    expect(matchesTimelineFilters(salon("a", 1, 0, 1), seulsSalons, CTX)).toBe(true);
    expect(matchesTimelineFilters(evenement("x", 1, 0, 1), seulsSalons, CTX)).toBe(false);
  });

  it("par persona : les salons où il a écrit, ses journaux ; les événements restent", () => {
    const tess = filtres({ personaId: "p-tess" });
    expect(matchesTimelineFilters(salon("a", 1, 0, 1), tess, CTX)).toBe(true);
    expect(matchesTimelineFilters(salon("b", 1, 0, 1), tess, CTX)).toBe(false);
    expect(matchesTimelineFilters(journal("j", "p-tess", 1, 0, 1), tess, CTX)).toBe(true);
    expect(matchesTimelineFilters(journal("k", "p-ivo", 1, 0, 1), tess, CTX)).toBe(false);
    expect(matchesTimelineFilters(evenement("x", 1, 0, 1), tess, CTX)).toBe(true);
  });

  it("par joueur, arc, catégorie : des filtres de salon, qui masquent les journaux", () => {
    expect(matchesTimelineFilters(salon("b", 1, 0, 1), filtres({ player: "Mojkkin" }), CTX)).toBe(true);
    expect(matchesTimelineFilters(salon("a", 1, 0, 1), filtres({ player: "Mojkkin" }), CTX)).toBe(false);
    expect(matchesTimelineFilters(salon("a", 1, 0, 1, { arcId: "arc" } as Partial<TimelineItem>), filtres({ arcId: "arc" }), CTX)).toBe(true);
    expect(matchesTimelineFilters(salon("a", 1, 0, 1), filtres({ arcId: "arc" }), CTX)).toBe(false);
    expect(matchesTimelineFilters(salon("a", 1, 0, 1, { categoryId: "cat" } as Partial<TimelineItem>), filtres({ categoryId: "cat" }), CTX)).toBe(true);
    expect(matchesTimelineFilters(journal("j", "p-tess", 1, 0, 1), filtres({ arcId: "arc" }), CTX)).toBe(false);
  });

  it("compte les filtres actifs, la recherche à part", () => {
    expect(countActiveFilters(NO_TIMELINE_FILTERS)).toBe(0);
    expect(isFiltering(filtres({ query: "  " }))).toBe(false);
    expect(isFiltering(filtres({ query: "x" }))).toBe(true);
    expect(countActiveFilters(filtres({ kinds: new Set(["room"]), arcId: "a", personaId: "p" }))).toBe(3);
  });
});

describe("saisons et périodes", () => {
  it("une saison sans fin court jusqu'à la suivante ; les chevauchements se coupent", () => {
    expect(normalizeAges([
      { name: "Âge des Cendres", from_year: 1, to_year: null },
      { name: " ", from_year: 5, to_year: 9 },
      { name: "Âge du Sel", from_year: 20, to_year: 60 },
      { name: "Âge du Verre", from_year: 40, to_year: null },
    ])).toEqual([
      { name: "Âge des Cendres", from_year: 1, to_year: 19 },
      { name: "Âge du Sel", from_year: 20, to_year: 39 },
      { name: "Âge du Verre", from_year: 40, to_year: null },
    ]);
  });

  it("les saisons remplacent les tranches ; les années hors saison gardent une tranche", () => {
    const ages = normalizeAges([{ name: "Âge des Cendres", from_year: 10, to_year: 19 }]);
    const { periods, periodOf } = buildTimelinePeriods([1, 2, 12, 15, 47], ages);
    expect(periods.map((p) => p.label)).toEqual(["1 – 5", "Âge des Cendres", "46 – 50"]);
    expect(periods[1].firstYear).toBe(12);
    expect(periodOf(15)).toBe(periodOf(12));
    expect(periodOf(2)).not.toBe(periodOf(12));
  });

  it("sans saison, les tranches de cinq ans d'avant", () => {
    const { periods } = buildTimelinePeriods([1, 6, 12], []);
    expect(periods.map((p) => p.label)).toEqual(["1 – 5", "6 – 10", "11 – 15"]);
  });
});

describe("assignSuiteLanes", () => {
  it("deux lignes qui se chevauchent n'ont pas le même couloir ; une ligne libérée le rend", () => {
    expect(assignSuiteLanes([
      { top: 0, bottom: 100 },
      { top: 50, bottom: 150 },
      { top: 120, bottom: 200 },
      { top: 160, bottom: 180 },
    ])).toEqual([0, 1, 0, 1]);
  });
});

describe("chaînes de suites", () => {
  it("les paires qui partagent un salon forment une chaîne, colorée par la première paire colorée", async () => {
    const { buildSuiteChains, suiteChainOf } = await import("@/lib/worldTimelineItems");
    const paires = [
      { from: "a", to: "b", color: null },
      { from: "b", to: "c", color: "#a855f7" },
      { from: "x", to: "y", color: "#0ea5e9" },
      { from: "c", to: "d", color: "#f59e0b" },
    ];
    const chaines = buildSuiteChains(paires);
    expect(chaines).toHaveLength(2);
    expect(chaines[0]).toEqual({ ids: ["a", "b", "c", "d"], color: "#a855f7" });
    expect(chaines[1]).toEqual({ ids: ["x", "y"], color: "#0ea5e9" });
    expect([...suiteChainOf(paires, "c")!]).toEqual(["a", "b", "c", "d"]);
    expect(suiteChainOf(paires, "seul")).toBeNull();
  });
});

describe("arcRanks", () => {
  it("numérote les salons de chaque arc dans l'ordre du récit ; la suite passe après, à date égale", async () => {
    const { arcRanks } = await import("@/lib/worldTimelineItems");
    const ranks = arcRanks([
      salon("c", 3, 0, 1, { arcId: "exil" } as Partial<TimelineItem>),
      salon("b", 1, 2, 9, { arcId: "exil", previousIds: ["a"] } as Partial<TimelineItem>),
      salon("a", 1, 2, 9, { arcId: "exil" } as Partial<TimelineItem>),
      salon("x", 1, 0, 1, { arcId: "crue" } as Partial<TimelineItem>),
      salon("libre", 1, 0, 1),
      evenement("e", 1, 0, 1),
    ]);
    expect(Object.fromEntries(ranks)).toEqual({ a: 1, b: 2, c: 3, x: 1 });
  });
});
