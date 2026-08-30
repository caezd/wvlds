import { describe, it, expect } from "vitest";

import { calcPopoverPos, CARTE_L, CARTE_H, MARGE } from "../popoverPosition";

// ──────────────────────────────────────────────────────────────────────────
// Placement du panneau flottant d'un point de carte, jusqu'ici noyé dans un
// composant de 1 375 lignes et lisant `window` directement — donc invérifiable.
//
// Ce qui est contrôlé n'est pas une apparence, impossible à juger depuis jsdom
// qui ne met rien en page, mais la promesse : le panneau reste entièrement à
// l'écran, quel que soit l'endroit du clic. Un panneau qui déborde est un
// panneau dont on ne peut pas atteindre le bouton de fermeture.
// ──────────────────────────────────────────────────────────────────────────

const ECRAN = { largeur: 1280, hauteur: 800 };

/** Le panneau tient-il entièrement dans l'écran ? */
function tientDansLEcran(
  pos: { left: number; top: number },
  ecran = ECRAN,
): boolean {
  return (
    pos.left >= 0 &&
    pos.top >= 0 &&
    pos.left + CARTE_L <= ecran.largeur &&
    pos.top + CARTE_H <= ecran.hauteur
  );
}

describe("calcPopoverPos", () => {
  it("place le panneau à droite du clic quand la place le permet", () => {
    const pos = calcPopoverPos(100, 400, ECRAN);
    expect(pos.left).toBe(116); // 100 + 16
    expect(pos.top).toBe(400 - CARTE_H / 2);
    expect(tientDansLEcran(pos)).toBe(true);
  });

  it("bascule à gauche plutôt que de déborder à droite", () => {
    const pos = calcPopoverPos(1200, 400, ECRAN);
    expect(pos.left).toBeLessThan(1200);
    expect(tientDansLEcran(pos)).toBe(true);
  });

  it("reste à l'écran depuis n'importe quel point de clic", () => {
    // Le contrôle qui compte : on balaie l'écran entier plutôt que de
    // vérifier trois cas choisis.
    const debordements: string[] = [];
    for (let x = 0; x <= ECRAN.largeur; x += 40) {
      for (let y = 0; y <= ECRAN.hauteur; y += 40) {
        const pos = calcPopoverPos(x, y, ECRAN);
        if (!tientDansLEcran(pos)) debordements.push(`(${x},${y}) → ${JSON.stringify(pos)}`);
      }
    }
    expect(debordements, debordements.slice(0, 5).join("\n")).toEqual([]);
  });

  it("garde la marge en haut et en bas", () => {
    expect(calcPopoverPos(400, 0, ECRAN).top).toBe(MARGE);
    expect(calcPopoverPos(400, ECRAN.hauteur, ECRAN).top).toBe(
      ECRAN.hauteur - CARTE_H - MARGE,
    );
  });

  it("centre verticalement sur le clic quand la place le permet", () => {
    const y = 400;
    expect(calcPopoverPos(100, y, ECRAN).top).toBe(y - CARTE_H / 2);
  });

  it("reste lisible sur un écran étroit", () => {
    // Le bornage horizontal manquait. Mesuré alors sur 375 px de large : un
    // clic à x=40 plaçait le panneau à left=-316, soit 24 pixels visibles sur
    // 340 — le panneau et son bouton de fermeture hors de portée.
    for (const largeur of [430, 390, 375]) {
      const ecran = { largeur, hauteur: 844 };
      for (let x = 0; x <= largeur; x += 10) {
        const { left } = calcPopoverPos(x, 400, ecran);
        const visible = Math.min(left + CARTE_L, largeur) - Math.max(left, 0);
        expect(
          visible,
          `écran ${largeur}px, clic x=${x} : ${visible}px visibles sur ${CARTE_L}`,
        ).toBeGreaterThanOrEqual(Math.min(CARTE_L, largeur - 2 * MARGE));
      }
    }
  });

  it("ne rend jamais NaN, même sur un écran plus petit que le panneau", () => {
    // Un écran étroit ne permet aucun placement satisfaisant ; il ne doit pas
    // pour autant produire des coordonnées invalides, qui feraient disparaître
    // le panneau au lieu de le mal placer.
    const minuscule = { largeur: 200, hauteur: 200 };
    const pos = calcPopoverPos(100, 100, minuscule);
    expect(Number.isFinite(pos.left)).toBe(true);
    expect(Number.isFinite(pos.top)).toBe(true);
    // Les marges l'emportent : le coin haut-gauche reste visible, le panneau
    // déborde à droite plutôt que de disparaître à gauche.
    expect(pos.top).toBe(MARGE);
    expect(pos.left).toBe(MARGE);
  });
});
