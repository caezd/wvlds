import { describe, it, expect } from "vitest";
import { birthDateFromParts, isAdult, isAdultIso, MIN_AGE } from "@/lib/age";

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

describe("birthDateFromParts / isAdultIso (date de naissance enregistrée)", () => {
  it("compose une date ISO, mois et jour sur deux chiffres", () => {
    expect(birthDateFromParts(1990, 3, 4, NOW)).toBe("1990-03-04");
  });

  it("refuse une date qui n'existe pas, future ou d'avant 1900", () => {
    expect(birthDateFromParts(2001, 2, 30, NOW)).toBeNull();
    expect(birthDateFromParts(2027, 1, 1, NOW)).toBeNull();
    expect(birthDateFromParts(1899, 12, 31, NOW)).toBeNull();
  });

  it("dit l'âge d'une date ISO comme isAdult", () => {
    expect(isAdultIso("2008-07-15", NOW)).toBe(true);
    expect(isAdultIso("2008-07-16", NOW)).toBe(false);
    expect(isAdultIso("pas une date", NOW)).toBe(false);
  });
});
