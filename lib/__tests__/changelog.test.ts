import { describe, it, expect } from "vitest";
import {
  groupByMonth,
  formatMonth,
  formatDay,
  categoryTree,
  matchesFilter,
  CHANGELOG,
  CHANGELOG_AREAS,
  CHANGELOG_CATEGORIES,
  type ChangelogEntry,
  type ChangelogFilter,
} from "@/lib/changelog";

const entries: ChangelogEntry[] = [
  { date: "2026-06", category: "Fonctionnalité", area: "Wiki", text: "a" },
  { date: "2026-06", category: "Correctif", text: "b" },
  { date: "2026-05", category: "Fonctionnalité", area: "Monde", text: "c" },
];

describe("groupByMonth", () => {
  it("regroupe les entrées par mois en conservant l'ordre", () => {
    const map = groupByMonth(entries);
    expect([...map.keys()]).toEqual(["2026-06", "2026-05"]);
    expect(map.get("2026-06")).toHaveLength(2);
    expect(map.get("2026-05")).toHaveLength(1);
  });

  it("retourne une map vide pour un tableau vide", () => {
    expect(groupByMonth([]).size).toBe(0);
  });
});

describe("formatMonth", () => {
  it("formate un mois AAAA-MM en libellé français", () => {
    expect(formatMonth("2026-06")).toBe("juin 2026");
    expect(formatMonth("2026-01")).toBe("janvier 2026");
  });
});

describe("formatDay", () => {
  it("formate le jour d'une entrée datée au jour", () => {
    expect(formatDay("2026-09-26")).toBe("26 sept.");
  });

  it("ne rend rien pour une entrée datée au mois", () => {
    expect(formatDay("2026-09")).toBeNull();
  });
});

describe("groupByMonth — entrées datées au jour", () => {
  it("range une entrée datée au jour dans son mois", () => {
    const map = groupByMonth([
      { date: "2026-09-26", category: "Correctif", text: "a" },
      { date: "2026-09", category: "Correctif", text: "b" },
    ]);
    expect([...map.keys()]).toEqual(["2026-09"]);
    expect(map.get("2026-09")).toHaveLength(2);
  });
});

describe("categoryTree", () => {
  it("liste les catégories présentes et leurs sous-catégories, dans l'ordre déclaré", () => {
    expect(categoryTree(entries)).toEqual([
      { category: "Fonctionnalité", areas: ["Monde", "Wiki"] },
      { category: "Correctif", areas: [] },
    ]);
  });
});

describe("matchesFilter", () => {
  const [wiki, correctif, monde] = entries;

  it("garde tout sans filtre", () => {
    expect(entries.every((e) => matchesFilter(e, new Map()))).toBe(true);
  });

  it("une catégorie sans sous-catégorie cochée garde toute la catégorie", () => {
    const filter: ChangelogFilter = new Map([["Fonctionnalité", new Set()]]);
    expect(matchesFilter(wiki, filter)).toBe(true);
    expect(matchesFilter(monde, filter)).toBe(true);
    expect(matchesFilter(correctif, filter)).toBe(false);
  });

  it("une sous-catégorie cochée restreint sa catégorie", () => {
    const filter: ChangelogFilter = new Map([["Fonctionnalité", new Set(["Wiki"])]]);
    expect(matchesFilter(wiki, filter)).toBe(true);
    expect(matchesFilter(monde, filter)).toBe(false);
  });
});

describe("CHANGELOG (données)", () => {
  it("chaque entrée a une date AAAA-MM-JJ (ou AAAA-MM avant le 2026-09-26), une catégorie connue et du texte", () => {
    for (const e of CHANGELOG) {
      expect(e.date).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
      expect(CHANGELOG_CATEGORIES).toContain(e.category);
      if (e.area !== undefined) expect(CHANGELOG_AREAS).toContain(e.area);
      expect(e.text.length).toBeGreaterThan(0);
    }
  });

  it("les entrées récentes sont datées au jour", () => {
    for (const e of CHANGELOG) {
      if (e.date.length === 7) expect(e.date <= "2026-09").toBe(true);
    }
  });

  it("les dates se suivent de la plus récente à la plus ancienne", () => {
    const dates = CHANGELOG.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("n'utilise pas les guillemets anglais typographiques", () => {
    for (const e of CHANGELOG) expect(e.text).not.toMatch(/[“”]/);
  });
});
