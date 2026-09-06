import { describe, it, expect } from "vitest";
import {
  dedupeConsecutive,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  toSvgPoints,
} from "@/components/worlds/map/geometry";

// ──────────────────────────────────────────────────────────────────────────
// Une épingle marque un point ; un royaume est une surface. Les calculs sur
// les polygones se vérifient ici, sans navigateur.
// ──────────────────────────────────────────────────────────────────────────

const CARRE = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

describe("polygonArea", () => {
  it("mesure un carré, au signe du sens de parcours près", () => {
    expect(polygonArea(CARRE)).toBe(100);
    expect(polygonArea([...CARRE].reverse())).toBe(-100);
  });
});

describe("polygonCentroid", () => {
  it("trouve le centre d'un carré", () => {
    expect(polygonCentroid(CARRE)).toEqual({ x: 5, y: 5 });
  });

  it("pondère par l'aire, pas par le nombre de sommets", () => {
    // Un carré dont un côté est criblé de sommets : la moyenne des sommets
    // s'y égarerait, le centre reste au milieu.
    const cote = Array.from({ length: 20 }, (_, i) => ({ x: (i * 10) / 20, y: 0 }));
    expect(polygonCentroid([...cote, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toEqual({ x: 5, y: 5 });
  });

  it("retombe sur la moyenne quand tout est aligné", () => {
    expect(polygonCentroid([{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 8, y: 8 }])).toEqual({ x: 4, y: 4 });
    expect(polygonCentroid([])).toEqual({ x: 0, y: 0 });
  });
});

describe("pointInPolygon", () => {
  it("distingue dedans et dehors", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, CARRE)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, CARRE)).toBe(false);
    expect(pointInPolygon({ x: 5, y: -1 }, CARRE)).toBe(false);
  });

  it("suit un polygone concave", () => {
    // Un « L » : le coin manquant est dehors.
    const L = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon({ x: 2, y: 8 }, L)).toBe(true);
    expect(pointInPolygon({ x: 8, y: 8 }, L)).toBe(false);
  });
});

describe("dedupeConsecutive", () => {
  it("fond les sommets posés au même endroit", () => {
    // Un double-clic pour fermer pose deux fois le même point.
    expect(dedupeConsecutive([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10.2, y: 0.1 }, { x: 5, y: 8 }])).toEqual([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 },
    ]);
  });

  it("retire un dernier sommet qui rejoint le premier", () => {
    expect(dedupeConsecutive([...CARRE, { x: 0.1, y: 0.1 }])).toEqual(CARRE);
  });
});


describe("toSvgPoints", () => {
  it("écrit l'attribut d'un <polygon>", () => {
    expect(toSvgPoints([{ x: 1, y: 2 }, { x: 3.5, y: 4 }])).toBe("1,2 3.5,4");
  });
});
