import { describe, it, expect } from "vitest";

import {
  calcPopoverPos,
  pinAnchor,
  CARTE_L,
  CARTE_H,
  MARGE,
  ECART_EPINGLE,
  FLECHE,
} from "../popoverPosition";

// ──────────────────────────────────────────────────────────────────────────
// Placement du panneau flottant d'un point de carte, jusqu'ici noyé dans un
// composant de 1 375 lignes et lisant `window` directement — donc invérifiable.
//
// Ce qui est contrôlé n'est pas une apparence, impossible à juger depuis jsdom
// qui ne met rien en page, mais trois promesses :
//
//   1. le panneau reste entièrement à l'écran, où que soit l'épingle — un
//      panneau qui déborde est un panneau dont on ne peut pas atteindre le
//      bouton de fermeture ;
//   2. il se pose au-dessus de son épingle, en dessous si la place manque ;
//   3. la flèche montre l'épingle, y compris quand le panneau a dû glisser
//      pour rester visible.
// ──────────────────────────────────────────────────────────────────────────

const ECRAN = { largeur: 1280, hauteur: 800 };

/** Le panneau tient-il entièrement dans l'écran ? */
function tientDansLEcran(
  pos: { left: number; top: number },
  ecran = ECRAN,
  hauteur = CARTE_H,
): boolean {
  return (
    pos.left >= 0 &&
    pos.top >= 0 &&
    pos.left + CARTE_L <= ecran.largeur &&
    pos.top + hauteur <= ecran.hauteur
  );
}

describe("calcPopoverPos — côté", () => {
  it("se pose au-dessus de l'épingle quand la place le permet", () => {
    const pos = calcPopoverPos(640, 700, ECRAN);

    expect(pos.placement).toBe("above");
    expect(pos.top).toBe(700 - ECART_EPINGLE - CARTE_H);
    expect(tientDansLEcran(pos)).toBe(true);
  });

  it("bascule en dessous quand l'épingle est trop haute", () => {
    const pos = calcPopoverPos(640, 100, ECRAN);

    expect(pos.placement).toBe("below");
    expect(pos.top).toBe(100 + ECART_EPINGLE);
    expect(tientDansLEcran(pos)).toBe(true);
  });

  it("garde le côté le plus dégagé quand la place manque des deux", () => {
    // Écran bas : ni au-dessus ni en dessous le panneau ne tient entier.
    const ecran = { largeur: 1280, hauteur: 500 };

    expect(calcPopoverPos(640, 400, ecran).placement).toBe("above");
    expect(calcPopoverPos(640, 100, ecran).placement).toBe("below");
  });

  it("tient compte de la hauteur réelle du panneau", () => {
    // Un panneau sans bannière ni description est bien plus court que la
    // hauteur supposée : le placer comme s'il faisait 460 px le décollerait
    // de son épingle.
    const pos = calcPopoverPos(640, 400, ECRAN, 200);

    expect(pos.top).toBe(400 - ECART_EPINGLE - 200);
  });
});

describe("calcPopoverPos — cadrage", () => {
  it("centre le panneau sur l'épingle", () => {
    expect(calcPopoverPos(640, 700, ECRAN).left).toBe(640 - CARTE_L / 2);
  });

  it("reste à l'écran depuis n'importe quelle épingle", () => {
    // Le contrôle qui compte : on balaie l'écran entier plutôt que de
    // vérifier trois cas choisis.
    const debordements: string[] = [];
    for (let x = 0; x <= ECRAN.largeur; x += 40) {
      for (let y = 0; y <= ECRAN.hauteur; y += 40) {
        const pos = calcPopoverPos(x, y, ECRAN);
        if (!tientDansLEcran(pos)) debordements.push(`(${x},${y})`);
      }
    }
    expect(debordements, debordements.slice(0, 5).join(" ; ")).toEqual([]);
  });

  it("garde la marge en haut et en bas", () => {
    // Épingle collée au bord haut : le panneau passe dessous, à l'écart voulu.
    const enHaut = calcPopoverPos(400, 0, ECRAN);
    expect(enHaut.placement).toBe("below");
    expect(enHaut.top).toBe(ECART_EPINGLE);

    // Épingle collée au bord bas : au-dessus, sans jamais dépasser la marge.
    const enBas = calcPopoverPos(400, ECRAN.hauteur, ECRAN);
    expect(enBas.placement).toBe("above");
    expect(enBas.top).toBeGreaterThanOrEqual(MARGE);
    expect(enBas.top + CARTE_H).toBeLessThanOrEqual(ECRAN.hauteur - MARGE);
  });

  it("reste lisible sur un écran étroit", () => {
    // Mesuré sur 375 px de large : un panneau centré sur une épingle proche
    // d'un bord sortait de l'écran, avec son bouton de fermeture.
    for (const largeur of [430, 390, 375]) {
      const ecran = { largeur, hauteur: 844 };
      for (let x = 0; x <= largeur; x += 10) {
        const { left } = calcPopoverPos(x, 400, ecran);
        const visible = Math.min(left + CARTE_L, largeur) - Math.max(left, 0);
        expect(
          visible,
          `écran ${largeur}px, épingle x=${x} : ${visible}px visibles sur ${CARTE_L}`,
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
    expect(Number.isFinite(pos.arrowLeft)).toBe(true);
    // Les marges l'emportent : le coin haut-gauche reste visible, le panneau
    // déborde à droite plutôt que de disparaître à gauche.
    expect(pos.top).toBe(MARGE);
    expect(pos.left).toBe(MARGE);
  });
});

describe("calcPopoverPos — flèche", () => {
  it("plante la flèche au milieu quand le panneau est centré", () => {
    expect(calcPopoverPos(640, 700, ECRAN).arrowLeft).toBe(CARTE_L / 2);
  });

  it("suit l'épingle quand le panneau glisse pour rester à l'écran", () => {
    // Épingle près du bord droit : le panneau est ramené dans l'écran, la
    // flèche reste sur l'épingle — sans quoi elle montrerait le vide.
    const anchorX = ECRAN.largeur - 30;
    const pos = calcPopoverPos(anchorX, 700, ECRAN);

    expect(pos.left).toBe(ECRAN.largeur - CARTE_L - MARGE);
    expect(pos.left + pos.arrowLeft).toBeCloseTo(anchorX, 6);
  });

  it("ne sort jamais du panneau, ni de ses angles arrondis", () => {
    const fautifs: string[] = [];
    for (let x = -200; x <= ECRAN.largeur + 200; x += 10) {
      const { arrowLeft } = calcPopoverPos(x, 700, ECRAN);
      if (arrowLeft < FLECHE || arrowLeft > CARTE_L - FLECHE) fautifs.push(`x=${x}`);
    }
    expect(fautifs, fautifs.slice(0, 5).join(" ; ")).toEqual([]);
  });
});

describe("pinAnchor", () => {
  // La carte occupe 800×600 à l'écran, coin haut-gauche à (100, 50).
  const CARTE = { left: 100, top: 50, width: 800, height: 600 };

  it("ancre l'épingle sur sa position en pourcentage", () => {
    expect(pinAnchor(CARTE, { x: 50, y: 50 })).toEqual({ x: 500, y: 350 });
    expect(pinAnchor(CARTE, { x: 0, y: 0 })).toEqual({ x: 100, y: 50 });
    expect(pinAnchor(CARTE, { x: 100, y: 100 })).toEqual({ x: 900, y: 650 });
  });

  it("suit la carte quand on la déplace", () => {
    // Le panneau se posait à l'endroit du clic et n'en bougeait plus : après
    // 200 px de déplacement, il désignait un lieu qui n'était plus dessous.
    const epingle = { x: 25, y: 40 };
    const avant = pinAnchor(CARTE, epingle);
    const apres = pinAnchor({ ...CARTE, left: CARTE.left - 200, top: CARTE.top - 120 }, epingle);

    expect(apres.x).toBe(avant.x - 200);
    expect(apres.y).toBe(avant.y - 120);
  });

  it("suit la carte quand on l'agrandit", () => {
    const epingle = { x: 75, y: 50 };
    const agrandie = { left: 100, top: 50, width: 1600, height: 1200 };

    expect(pinAnchor(agrandie, epingle)).toEqual({ x: 100 + 1200, y: 50 + 600 });
  });

  it("place le panneau à l'écran pour n'importe quelle épingle", () => {
    const debordements: string[] = [];
    for (let x = 0; x <= 100; x += 5) {
      for (let y = 0; y <= 100; y += 5) {
        const ancre = pinAnchor(CARTE, { x, y });
        const pos = calcPopoverPos(ancre.x, ancre.y, ECRAN);
        if (!tientDansLEcran(pos)) debordements.push(`(${x}%,${y}%)`);
      }
    }
    expect(debordements, debordements.slice(0, 5).join(" ; ")).toEqual([]);
  });
});
