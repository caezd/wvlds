import { describe, it, expect } from "vitest";
import { isAdult, MIN_AGE } from "@/lib/age";

// Date de référence fixe pour des tests déterministes.
const NOW = new Date(2026, 6, 15); // 15 juillet 2026

describe("isAdult", () => {
  it("vrai pile 18 ans (anniversaire aujourd'hui)", () => {
    expect(isAdult(2008, 7, 15, NOW)).toBe(true);
  });

  it("faux la veille des 18 ans", () => {
    expect(isAdult(2008, 7, 16, NOW)).toBe(false);
  });

  it("vrai le lendemain des 18 ans", () => {
    expect(isAdult(2008, 7, 14, NOW)).toBe(true);
  });

  it("vrai largement majeur", () => {
    expect(isAdult(1990, 1, 1, NOW)).toBe(true);
  });

  it("faux clairement mineur", () => {
    expect(isAdult(2020, 5, 10, NOW)).toBe(false);
  });

  it("faux si mois antérieur non encore atteint dans l'année des 18 ans", () => {
    // Né en décembre 2008 : au 15 juillet 2026 il a encore 17 ans.
    expect(isAdult(2008, 12, 1, NOW)).toBe(false);
  });

  it("rejette une date invalide (31 février)", () => {
    expect(isAdult(2000, 2, 31, NOW)).toBe(false);
  });

  it("rejette une date dans le futur", () => {
    expect(isAdult(2030, 1, 1, NOW)).toBe(false);
  });

  it("rejette des composantes non entières", () => {
    expect(isAdult(NaN, 1, 1, NOW)).toBe(false);
  });

  it("MIN_AGE vaut 18", () => {
    expect(MIN_AGE).toBe(18);
  });
});
