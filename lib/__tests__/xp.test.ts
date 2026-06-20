import { describe, it, expect } from "vitest";
import { levelInfo } from "@/lib/xp";
import { initials } from "@/lib/persona-display";

describe("levelInfo", () => {
  it("niveau 1 à 0 XP", () => {
    expect(levelInfo(0)).toEqual({ level: 1, xpForNext: 100, base: 0, progress: 0 });
  });

  it("niveau et progression au milieu d'un palier", () => {
    expect(levelInfo(150)).toMatchObject({ level: 2, xpForNext: 200, base: 100, progress: 50 });
  });

  it("progression à 99 % juste avant le niveau suivant", () => {
    expect(levelInfo(99).progress).toBe(99);
    expect(levelInfo(99).level).toBe(1);
  });

  it("passe au niveau supérieur au palier exact", () => {
    expect(levelInfo(200).level).toBe(3);
    expect(levelInfo(200).progress).toBe(0);
  });
});

describe("initials", () => {
  it("prend les initiales de deux mots", () => {
    expect(initials("Aria Stormwind")).toBe("AS");
  });

  it("un seul mot → une lettre", () => {
    expect(initials("Gornak")).toBe("G");
  });

  it("nom vide → P par défaut", () => {
    expect(initials("   ")).toBe("P");
  });

  it("met en majuscules et ignore les espaces multiples", () => {
    expect(initials("  jean   paul ")).toBe("JP");
  });
});
