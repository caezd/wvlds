import { describe, it, expect } from "vitest";
import {
  calibrateWidthUnits,
  distanceBetween,
  formatDistance,
  roundDistance,
  scaleBarFor,
  segmentLength,
} from "@/components/worlds/map/scale";

// ──────────────────────────────────────────────────────────────────────────
// Une carte sans échelle est un dessin ; avec, elle répond à « c'est loin ? ».
// L'échelle se note par ce que représente la largeur entière de la carte.
// ──────────────────────────────────────────────────────────────────────────

const KM = { widthUnits: 1000, unit: "km" };

describe("segmentLength", () => {
  it("mesure en pourcentage de la largeur", () => {
    expect(segmentLength({ x: 10, y: 50 }, { x: 40, y: 50 }, 0.5)).toBe(30);
  });

  it("ramène la hauteur à la largeur sur une carte oblongue", () => {
    // Carte deux fois plus large que haute : 20 % de hauteur font 10 % de largeur.
    expect(segmentLength({ x: 0, y: 0 }, { x: 0, y: 20 }, 0.5)).toBe(10);
    // Et 3-4-5 : 30 % en largeur, 40 % de largeur en hauteur (80 % de hauteur).
    expect(segmentLength({ x: 0, y: 0 }, { x: 30, y: 80 }, 0.5)).toBe(50);
  });

  it("prend un rapport inconnu pour 1", () => {
    expect(segmentLength({ x: 0, y: 0 }, { x: 0, y: 20 }, NaN)).toBe(20);
    expect(segmentLength({ x: 0, y: 0 }, { x: 0, y: 20 }, 0)).toBe(20);
  });
});

describe("distanceBetween", () => {
  it("convertit en unités du monde", () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 25, y: 0 }, 1, KM)).toBe(250);
  });
});

describe("calibrateWidthUnits", () => {
  it("déduit la largeur d'une distance déclarée", () => {
    // Le segment fait 25 % de la largeur et 50 km : la carte fait 200 km.
    expect(calibrateWidthUnits({ x: 0, y: 0 }, { x: 25, y: 0 }, 1, 50)).toBe(200);
  });

  it("est l'inverse de la mesure", () => {
    const a = { x: 12, y: 33 };
    const b = { x: 71, y: 8 };
    const largeur = calibrateWidthUnits(a, b, 0.7, 42)!;
    expect(distanceBetween(a, b, 0.7, { widthUnits: largeur, unit: "" })).toBeCloseTo(42, 10);
  });

  it("ne déduit rien d'un segment nul ou d'une distance absurde", () => {
    const p = { x: 10, y: 10 };
    expect(calibrateWidthUnits(p, p, 1, 50)).toBeNull();
    expect(calibrateWidthUnits(p, { x: 20, y: 10 }, 1, 0)).toBeNull();
    expect(calibrateWidthUnits(p, { x: 20, y: 10 }, 1, -3)).toBeNull();
    expect(calibrateWidthUnits(p, { x: 20, y: 10 }, 1, NaN)).toBeNull();
  });
});

describe("roundDistance / formatDistance", () => {
  it("arrondit selon la grandeur", () => {
    expect(roundDistance(1234.567)).toBe(1235);
    expect(roundDistance(42.36)).toBe(42.4);
    expect(roundDistance(3.14159)).toBe(3.14);
  });

  it("écrit le nombre dans la langue du lecteur, suivi de l'unité", () => {
    expect(formatDistance(1234.5, "km", "en")).toBe("1,235 km");
    expect(formatDistance(3.14159, "lieues", "en")).toBe("3.14 lieues");
    expect(formatDistance(7, "", "en")).toBe("7");
  });
});

describe("scaleBarFor", () => {
  it("choisit un nombre rond d'unités qui tient dans la cible", () => {
    // 1 px par km, cible 120 px : 100 km, 100 px.
    expect(scaleBarFor(1, 120)).toEqual({ units: 100, px: 100 });
    // 3 px par km : 120 / 3 = 40 → 20 km, 60 px.
    expect(scaleBarFor(3, 120)).toEqual({ units: 20, px: 60 });
    // 0.02 px par km : 6 000 → 5 000 km, 100 px.
    expect(scaleBarFor(0.02, 120)).toEqual({ units: 5000, px: 100 });
  });

  it("reste entre les deux cinquièmes et la totalité de la cible", () => {
    // Le pire cas : une mantisse juste sous 5, ramenée à 2.
    for (const ppu of [0.013, 0.7, 1.9, 4.99, 5.01, 33, 250, 24.99]) {
      const barre = scaleBarFor(ppu, 120)!;
      expect(barre.px).toBeGreaterThanOrEqual(48);
      expect(barre.px).toBeLessThanOrEqual(120.0001);
    }
  });

  it("ne dessine rien sans échelle exploitable", () => {
    expect(scaleBarFor(0)).toBeNull();
    expect(scaleBarFor(NaN)).toBeNull();
    expect(scaleBarFor(Infinity)).toBeNull();
  });
});
