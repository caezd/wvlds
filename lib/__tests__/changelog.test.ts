import { describe, it, expect } from "vitest";
import {
  groupByMonth,
  formatMonth,
  allTags,
  CHANGELOG,
  type ChangelogEntry,
} from "@/lib/changelog";

const entries: ChangelogEntry[] = [
  { date: "2026-06", tag: "Mondes", text: "a" },
  { date: "2026-06", tag: "Chatrooms", text: "b" },
  { date: "2026-05", tag: "Mondes", text: "c" },
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

describe("allTags", () => {
  it("retourne les tags uniques triés", () => {
    expect(allTags(entries)).toEqual(["Chatrooms", "Mondes"]);
  });
});

describe("CHANGELOG (données)", () => {
  it("chaque entrée a une date au format AAAA-MM, un tag et du texte", () => {
    for (const e of CHANGELOG) {
      expect(e.date).toMatch(/^\d{4}-\d{2}$/);
      expect(e.tag.length).toBeGreaterThan(0);
      expect(e.text.length).toBeGreaterThan(0);
    }
  });
});
