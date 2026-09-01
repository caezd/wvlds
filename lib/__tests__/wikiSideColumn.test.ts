import { describe, it, expect } from "vitest";

import { laColonneTient, mesurePleineDuCorps } from "@/lib/wikiSideColumn";

const REM = 16;
/** Largeurs configurées des deux colonnes du wiki. */
const NAV = 208;
const NOTES = 320;

/** Les deux seuils du wiki, lus sur la même zone — voir `WorldWiki`. */
function colonnes(largeurZone: number | null) {
  const commun = { largeurZone, grandEcran: true, rem: REM };
  return {
    pages: laColonneTient({ ...commun, largeurColonne: NAV, siInconnu: true }),
    notes: laColonneTient({ ...commun, largeurColonne: NAV + NOTES }),
  };
}

describe("mesurePleineDuCorps", () => {
  it("compte le corps et ses deux gouttières", () => {
    // 48 rem de texte, plus `px-4` de chaque côté.
    expect(mesurePleineDuCorps(true, REM)).toBe((48 + 2) * REM);
    // 40 rem et `px-2` en dessous de `lg`.
    expect(mesurePleineDuCorps(false, REM)).toBe((40 + 1) * REM);
  });

  it("suit le `rem` du lecteur, qui peut l'avoir grossi", () => {
    expect(mesurePleineDuCorps(true, 20)).toBe((48 + 2) * 20);
  });
});

describe("la cascade des deux colonnes", () => {
  const MESURE = mesurePleineDuCorps(true, REM); // 800

  it("garde les deux tant que le corps a sa mesure", () => {
    expect(colonnes(MESURE + NAV + NOTES)).toEqual({ pages: true, notes: true });
  });

  it("retire les notes en premier, et garde les pages", () => {
    // Un pixel de moins qu'il n'en faut aux trois : c'est la colonne qui
    // accompagne l'article qui cède, pas celle qui sert à en changer.
    expect(colonnes(MESURE + NAV + NOTES - 1)).toEqual({ pages: true, notes: false });
  });

  it("retire les pages à leur tour quand elles seules rognent le corps", () => {
    expect(colonnes(MESURE + NAV - 1)).toEqual({ pages: false, notes: false });
  });

  it("ne fait jamais revenir une colonne en rétrécissant", () => {
    // Les deux seuils se lisent sur la même zone et sur les largeurs
    // CONFIGURÉES, jamais sur ce qui est monté à l'instant. Sans quoi le départ
    // des notes élargirait la zone, qui les ferait revenir, qui la rétrécirait.
    let vues = 2;
    for (let zone = MESURE + NAV + NOTES + 100; zone > 0; zone -= 7) {
      const { pages, notes } = colonnes(zone);
      const montees = Number(pages) + Number(notes);
      expect(montees).toBeLessThanOrEqual(vues);
      vues = montees;
    }
  });
});

describe("laColonneTient — avant toute mesure", () => {
  it("se tait dans le sens que l'appelant lui donne", () => {
    // Les notes n'osent pas : deux panneaux montés ouvriraient deux fois le
    // même canal Realtime. L'arbre des pages, lui, n'en ouvre aucun.
    expect(colonnes(null)).toEqual({ pages: true, notes: false });
  });
});
