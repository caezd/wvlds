import { describe, it, expect } from "vitest";

import { BUTTON_FACTOR, WHEEL_FACTOR, ZOOM_MAX, ZOOM_MIN, clampZoom, distance, focusView, zoomAround, type View } from "../panZoom";

// ──────────────────────────────────────────────────────────────────────────
// Le plateau des relations change de taille réelle quand on zoome (le texte
// reste net) ; son centre est décalé de `pan` par rapport au centre de la
// fenêtre. Une erreur de signe ne se voit pas en lisant la formule : le
// plateau part simplement de travers sous le curseur. D'où ces contrôles,
// qui énoncent la propriété voulue plutôt que la formule.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Où tombe, à l'écran (relatif au centre de la fenêtre), un point du plateau
 * repéré en fraction de sa largeur depuis son centre.
 */
function project(view: View, base: number, u: { x: number; y: number }) {
  return { x: view.pan.x + u.x * base * view.zoom, y: view.pan.y + u.y * base * view.zoom };
}
/** L'inverse : quelle fraction du plateau est sous ce point de l'écran. */
function unproject(view: View, base: number, p: { x: number; y: number }) {
  return { x: (p.x - view.pan.x) / (base * view.zoom), y: (p.y - view.pan.y) / (base * view.zoom) };
}

describe("clampZoom", () => {
  it("borne entre 50 % et 500 %", () => {
    expect(ZOOM_MIN).toBe(0.5);
    expect(ZOOM_MAX).toBe(5);
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1.3)).toBe(1.3);
  });

  it("des crans de 1,2 à la molette, de 1,25 aux boutons", () => {
    expect(WHEEL_FACTOR).toBe(1.2);
    expect(BUTTON_FACTOR).toBe(1.25);
  });
});

describe("zoomAround", () => {
  const base = 700;

  it("laisse sous le curseur le même endroit du plateau", () => {
    const cas: Array<[View, number, { x: number; y: number }]> = [
      [{ zoom: 1, pan: { x: 0, y: 0 } }, WHEEL_FACTOR, { x: 120, y: -80 }],
      [{ zoom: 2.4, pan: { x: -300, y: 140 } }, 1 / WHEEL_FACTOR, { x: -50, y: 200 }],
      [{ zoom: 0.8, pan: { x: 40, y: 40 } }, BUTTON_FACTOR, { x: 0, y: 0 }],
    ];
    for (const [view, factor, anchor] of cas) {
      const before = unproject(view, base, anchor);
      const next = zoomAround(view, factor, anchor);
      const after = project(next, base, before);
      expect(after.x).toBeCloseTo(anchor.x, 9);
      expect(after.y).toBeCloseTo(anchor.y, 9);
    }
  });

  it("ne bouge rien quand le zoom est déjà en butée", () => {
    const view = { zoom: ZOOM_MAX, pan: { x: 12, y: -34 } };
    expect(zoomAround(view, 2, { x: 200, y: 100 })).toEqual(view);
  });

  it("borne le zoom demandé", () => {
    expect(zoomAround({ zoom: 1, pan: { x: 0, y: 0 } }, 99, { x: 0, y: 0 }).zoom).toBe(ZOOM_MAX);
    expect(zoomAround({ zoom: 1, pan: { x: 0, y: 0 } }, 0.001, { x: 0, y: 0 }).zoom).toBe(ZOOM_MIN);
  });

  it("autour du centre de la fenêtre, le décalage suit simplement le facteur", () => {
    const r = zoomAround({ zoom: 1, pan: { x: 100, y: -40 } }, 2, { x: 0, y: 0 });
    expect(r.pan).toEqual({ x: 200, y: -80 });
  });

  it("suit l'ancre quand elle se déplace — le cas du pincement", () => {
    const view = { zoom: 1, pan: { x: 0, y: 0 } };
    const depart = { x: 100, y: 100 }, courante = { x: 160, y: 130 };
    const fixe = zoomAround(view, 2, depart);
    const suivie = zoomAround(view, 2, depart, courante);
    expect(suivie.pan.x - fixe.pan.x).toBeCloseTo(courante.x - depart.x, 9);
    expect(suivie.pan.y - fixe.pan.y).toBeCloseTo(courante.y - depart.y, 9);
  });
});

describe("focusView", () => {
  it("amène un point du repère au centre de la fenêtre", () => {
    const base = 800;
    const v = focusView({ x: 675, y: 225 }, 2.4, base);
    expect(v.zoom).toBe(2.4);
    // (675, 225) est à +1/4, −1/4 du centre du plateau : à l'écran, il tombe en 0.
    const p = project(v, base, { x: 675 / 900 - 0.5, y: 225 / 900 - 0.5 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it("borne le zoom", () => {
    expect(focusView({ x: 450, y: 450 }, 9, 500).zoom).toBe(ZOOM_MAX);
  });
});

describe("distance", () => {
  it("mesure l'écartement de deux doigts", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
