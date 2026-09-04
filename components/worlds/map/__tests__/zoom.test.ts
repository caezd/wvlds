import { describe, it, expect } from "vitest";

import {
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  applyZoom,
  clampOffset,
  coverSize,
  clampScale,
  centerOn,
  distance,
  initialTransform,
  midpoint,
  pinchScale,
  wheelScale,
  type MapBounds,
  type MapTransform,
} from "../zoom";

// ──────────────────────────────────────────────────────────────────────────
// Le déplacement et l'agrandissement de la carte étaient noyés dans le
// composant, entre `useState` et lectures de `window`. Ce qui se vérifie ici
// n'est pas une apparence — jsdom ne met rien en page — mais deux promesses :
//
//   1. le point visé (curseur, milieu des doigts) ne bouge pas sous le geste ;
//   2. aucun vide n'apparaît jamais derrière l'image.
//
// La seconde tenait à un bornage recopié à trois endroits, dont l'un — celui
// de la molette — n'était pas testé.
// ──────────────────────────────────────────────────────────────────────────

/** Cadre de 800×600 pour une image posée en pleine largeur, plus haute que lui. */
const CADRE: MapBounds = {
  containerWidth: 800,
  containerHeight: 600,
  imageWidth: 800,
  imageHeight: 1000,
};

/** L'image couvre-t-elle encore tout le cadre, sans vide sur les bords ? */
function sansVide(t: MapTransform, bounds = CADRE): boolean {
  return (
    t.x <= 0 &&
    t.y <= 0 &&
    t.x + bounds.imageWidth * t.scale >= Math.min(bounds.containerWidth, bounds.imageWidth * t.scale) &&
    t.x >= Math.min(0, bounds.containerWidth - bounds.imageWidth * t.scale) &&
    t.y >= Math.min(0, bounds.containerHeight - bounds.imageHeight * t.scale)
  );
}

describe("clampScale", () => {
  it("garde l'échelle entre les deux bornes", () => {
    expect(clampScale(0.2)).toBe(ZOOM_MIN);
    expect(clampScale(1.5)).toBe(1.5);
    expect(clampScale(12)).toBe(ZOOM_MAX);
  });

  it("rend l'échelle minimale plutôt qu'un NaN", () => {
    // Un NaN se propagerait dans la transformation CSS et ferait disparaître
    // la carte — panne muette, sans erreur en console.
    expect(clampScale(Number.NaN)).toBe(ZOOM_MIN);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(ZOOM_MAX);
  });
});

describe("clampOffset", () => {
  it("fige l'axe où l'image ne dépasse pas du cadre", () => {
    // À l'échelle 1, l'image fait exactement la largeur du cadre : aucun
    // déplacement horizontal n'a de sens.
    expect(clampOffset(-200, 0, 1, CADRE).x).toBe(0);
    expect(clampOffset(200, 0, 1, CADRE).x).toBe(0);
  });

  it("laisse voir le bas de l'image sans découvrir de vide", () => {
    // Image de 1000 px dans un cadre de 600 : 400 px de course verticale.
    expect(clampOffset(0, -1000, 1, CADRE).y).toBe(-400);
    expect(clampOffset(0, 50, 1, CADRE).y).toBe(0);
  });

  it("ouvre la course horizontale dès que l'image est agrandie", () => {
    // À 2×, l'image fait 1600 px de large pour un cadre de 800.
    expect(clampOffset(-5000, 0, 2, CADRE).x).toBe(-800);
  });
});

describe("applyZoom", () => {
  const depart: MapTransform = { scale: 1, x: 0, y: 0 };

  it("garde le point visé sous le curseur", () => {
    const centre = { x: 400, y: 300 };
    const apres = applyZoom(depart, 2, centre, CADRE);

    // Le point de l'image sous le curseur avant et après le geste.
    const avant = { x: (centre.x - depart.x) / depart.scale, y: (centre.y - depart.y) / depart.scale };
    const rendu = { x: (centre.x - apres.x) / apres.scale, y: (centre.y - apres.y) / apres.scale };
    expect(rendu.x).toBeCloseTo(avant.x, 6);
    expect(rendu.y).toBeCloseTo(avant.y, 6);
  });

  it("ne rend pas un nouvel objet quand l'échelle ne bouge pas", () => {
    // Rendre le même objet évite de repeindre pour rien à chaque cran de
    // molette une fois la borne atteinte.
    const auMax: MapTransform = { scale: ZOOM_MAX, x: -10, y: -10 };
    expect(applyZoom(auMax, ZOOM_MAX + 1, { x: 0, y: 0 }, CADRE)).toBe(auMax);
  });

  it("ne laisse jamais de vide, où que l'on agrandisse", () => {
    const fautifs: string[] = [];
    for (let x = 0; x <= CADRE.containerWidth; x += 50) {
      for (let y = 0; y <= CADRE.containerHeight; y += 50) {
        let t: MapTransform = { scale: 1, x: 0, y: 0 };
        // Une dizaine de crans de molette vers le haut, puis autant vers le bas.
        for (let i = 0; i < 12; i++) t = applyZoom(t, wheelScale(t.scale, -1), { x, y }, CADRE);
        for (let i = 0; i < 12; i++) t = applyZoom(t, wheelScale(t.scale, 1), { x, y }, CADRE);
        if (!sansVide(t)) fautifs.push(`(${x},${y}) → ${JSON.stringify(t)}`);
        // Le pas étant proportionnel, l'aller-retour retombe sur 1 à l'erreur
        // de virgule flottante près — que le bornage absorbe.
        if (Math.abs(t.scale - ZOOM_MIN) > 1e-9) fautifs.push(`(${x},${y}) n'est pas revenu à l'échelle 1`);
      }
    }
    expect(fautifs, fautifs.slice(0, 5).join("\n")).toEqual([]);
  });
});

describe("wheelScale", () => {
  it("agrandit vers le haut, réduit vers le bas", () => {
    expect(wheelScale(1, -1)).toBeCloseTo(1 * (1 + ZOOM_STEP), 6);
    expect(wheelScale(1.5, 1)).toBeCloseTo(1.5 / (1 + ZOOM_STEP), 6);
  });

  it("garde le même ressenti en haut et en bas de plage", () => {
    // Un pas additif ferait un bond de 10 % en bas de plage et de 2,5 % en
    // haut : le zoom paraîtrait s'enliser à mesure qu'on entre dans la carte.
    expect(wheelScale(1, -1) / 1).toBeCloseTo(wheelScale(3, -1) / 3, 6);
  });

  it("traverse la plage en une quinzaine de crans", () => {
    let echelle = ZOOM_MIN;
    let crans = 0;
    while (echelle < ZOOM_MAX && crans < 100) {
      echelle = wheelScale(echelle, -1);
      crans++;
    }
    expect(crans).toBeLessThanOrEqual(20);
  });

  it("s'arrête aux bornes", () => {
    expect(wheelScale(ZOOM_MAX, -1)).toBe(ZOOM_MAX);
    expect(wheelScale(ZOOM_MIN, 1)).toBe(ZOOM_MIN);
  });
});

describe("pinchScale", () => {
  it("suit le rapport des écartements", () => {
    expect(pinchScale(1, 100, 150)).toBeCloseTo(1.5, 6);
    expect(pinchScale(2, 200, 100)).toBeCloseTo(1, 6);
  });

  it("garde l'échelle de départ quand l'écartement initial est nul", () => {
    // Deux doigts posés au même pixel : le rapport serait infini, et la carte
    // disparaîtrait d'un coup.
    expect(pinchScale(1.4, 0, 300)).toBeCloseTo(1.4, 6);
  });
});

describe("distance / midpoint", () => {
  it("mesure l'écartement et le milieu de deux doigts", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
});

describe("coverSize", () => {
  it("couvre un cadre plus haut que la carte", () => {
    // Cadre 800×600, carte 2:1 : ajustée elle ferait 800×400 et laisserait
    // 200 px de vide ; couvrante, elle fait 1200×600 et déborde en largeur.
    expect(coverSize({ width: 800, height: 600 }, { width: 2000, height: 1000 })).toEqual({
      width: 1200,
      height: 600,
    });
  });

  it("couvre un cadre plus large que la carte", () => {
    expect(coverSize({ width: 800, height: 600 }, { width: 1000, height: 2000 })).toEqual({
      width: 800,
      height: 1600,
    });
  });

  it("ne laisse aucun vide sur un cadre de téléphone", () => {
    // Le cas signalé : une carte large sur un écran étroit et haut.
    const cadre = { width: 744, height: 900 };
    const taille = coverSize(cadre, { width: 2400, height: 1400 });

    expect(taille.width).toBeGreaterThanOrEqual(cadre.width);
    expect(taille.height).toBeGreaterThanOrEqual(cadre.height);
    // Un axe touche le bord exactement : la carte n'est pas plus grande que
    // nécessaire.
    expect(Math.min(taille.width / cadre.width, taille.height / cadre.height)).toBeCloseTo(1, 6);
    // Proportions gardées.
    expect(taille.width / taille.height).toBeCloseTo(2400 / 1400, 6);
  });

  it("agrandit une carte plus petite que le cadre", () => {
    expect(coverSize({ width: 800, height: 600 }, { width: 400, height: 300 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("rend une taille nulle tant qu'une mesure manque", () => {
    // Avant le chargement de l'image, ou avant la première mesure du cadre.
    expect(coverSize({ width: 0, height: 0 }, { width: 100, height: 100 })).toEqual({ width: 0, height: 0 });
    expect(coverSize({ width: 800, height: 600 }, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });
});

describe("clampOffset — centrage", () => {
  // État transitoire : le cadre vient de grandir et la carte n'a pas encore
  // été remesurée, si bien qu'elle y tient momentanément en hauteur.
  const AJUSTEE: MapBounds = {
    containerWidth: 800,
    containerHeight: 600,
    imageWidth: 800,
    imageHeight: 400,
  };

  it("centre l'axe où la carte tient dans le cadre", () => {
    // (600 - 400) / 2 = 100 : la bande vide est répartie de part et d'autre,
    // au lieu de s'accumuler sous une carte collée en haut.
    expect(clampOffset(0, 0, 1, AJUSTEE)).toEqual({ x: 0, y: 100 });
    expect(clampOffset(0, -500, 1, AJUSTEE).y).toBe(100);
  });

  it("reprend le bornage dès que l'agrandissement fait déborder", () => {
    // À 2×, la carte fait 1600×800 : les deux axes dépassent.
    const t = clampOffset(-10_000, -10_000, 2, AJUSTEE);
    expect(t.x).toBe(-800);
    expect(t.y).toBe(-200);
  });

  it("recentre en revenant à l'échelle 1", () => {
    const agrandie = applyZoom({ scale: 1, x: 0, y: 100 }, 2, { x: 400, y: 300 }, AJUSTEE);
    const revenue = applyZoom(agrandie, 1, { x: 400, y: 300 }, AJUSTEE);

    expect(revenue).toEqual({ scale: 1, x: 0, y: 100 });
  });
});

describe("initialTransform", () => {
  /** Bornes d'un cadre et de la carte qui le couvre. */
  function bornes(cadre: { width: number; height: number }, carte: { width: number; height: number }) {
    const couvrante = coverSize(cadre, carte);
    return {
      containerWidth: cadre.width,
      containerHeight: cadre.height,
      imageWidth: couvrante.width,
      imageHeight: couvrante.height,
    };
  }

  it("garde l'échelle 1 : la couverture est déjà acquise", () => {
    expect(initialTransform(bornes({ width: 800, height: 600 }, { width: 2000, height: 1000 })).scale).toBe(1);
    expect(initialTransform(bornes({ width: 390, height: 844 }, { width: 4000, height: 400 })).scale).toBe(1);
  });

  it("centre le débordement au lieu de coller la carte à gauche", () => {
    // Cadre 800×600, carte 2:1 → 1200×600 : 400 px débordent, 200 de chaque côté.
    const t = initialTransform(bornes({ width: 800, height: 600 }, { width: 2000, height: 1000 }));

    expect(t.x).toBeCloseTo(-200, 6);
    expect(t.y).toBeCloseTo(0, 6);
  });

  it("ne laisse jamais voir le fond, quel que soit le cadre", () => {
    const fautifs: string[] = [];
    for (const cadre of [
      { width: 744, height: 900 },
      { width: 1600, height: 400 },
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ]) {
      for (const carte of [
        { width: 2000, height: 1000 },
        { width: 900, height: 1600 },
        { width: 1000, height: 1000 },
        { width: 4000, height: 400 },
      ]) {
        const b = bornes(cadre, carte);
        const t = initialTransform(b);
        const droite = t.x + b.imageWidth * t.scale;
        const bas = t.y + b.imageHeight * t.scale;
        if (t.x > 1e-6 || t.y > 1e-6 || droite < cadre.width - 1e-6 || bas < cadre.height - 1e-6) {
          fautifs.push(`${JSON.stringify(cadre)} / ${JSON.stringify(carte)} → ${JSON.stringify(t)}`);
        }
      }
    }
    expect(fautifs, fautifs.slice(0, 3).join(" ; ")).toEqual([]);
  });

  it("rend une vue neutre tant que la carte n'est pas mesurée", () => {
    expect(initialTransform({ containerWidth: 800, containerHeight: 600, imageWidth: 0, imageHeight: 0 }))
      .toEqual({ scale: 1, x: 0, y: 0 });
  });
});

describe("centerOn", () => {
  // Carte couvrante : 1200×600 dans un cadre de 800×600.
  const BORNES: MapBounds = {
    containerWidth: 800,
    containerHeight: 600,
    imageWidth: 1200,
    imageHeight: 600,
  };

  it("amène le point visé au centre du cadre", () => {
    // À l'échelle 2, la carte fait 2400 px : un lieu au quart de sa largeur
    // peut être amené au milieu du cadre sans découvrir de vide.
    const t = centerOn(BORNES, 2, { x: 25, y: 50 });

    expect(t.x + 0.25 * BORNES.imageWidth * 2).toBeCloseTo(BORNES.containerWidth / 2, 6);
    expect(t.y + 0.5 * BORNES.imageHeight * 2).toBeCloseTo(BORNES.containerHeight / 2, 6);
  });

  it("garde l'échelle telle quelle", () => {
    expect(centerOn(BORNES, 2.5, { x: 10, y: 10 }).scale).toBe(2.5);
  });

  it("ne découvre pas le fond pour un lieu au bord", () => {
    // Un lieu contre le bord ouest ne peut pas être tout à fait centré : le
    // faire glisser jusque-là laisserait voir le vide derrière la carte.
    const t = centerOn(BORNES, 1, { x: 0, y: 50 });
    expect(t.x).toBe(0);
  });

  it("ne laisse jamais de vide, où que soit le lieu", () => {
    const fautifs: string[] = [];
    for (let x = 0; x <= 100; x += 5) {
      for (let y = 0; y <= 100; y += 5) {
        for (const echelle of [1, 1.7, 3]) {
          const t = centerOn(BORNES, echelle, { x, y });
          const droite = t.x + BORNES.imageWidth * echelle;
          const bas = t.y + BORNES.imageHeight * echelle;
          if (t.x > 1e-6 || t.y > 1e-6 || droite < BORNES.containerWidth - 1e-6 || bas < BORNES.containerHeight - 1e-6) {
            fautifs.push(`(${x}%,${y}%) ×${echelle}`);
          }
        }
      }
    }
    expect(fautifs, fautifs.slice(0, 3).join(" ; ")).toEqual([]);
  });
});
