import { describe, it, expect } from "vitest";

import { borner, distance, zoomAutourDuPoint, ZOOM_MIN, ZOOM_MAX } from "../panZoom";

// ──────────────────────────────────────────────────────────────────────────
// Le zoom du canevas de relations était écrit deux fois dans le composant —
// une version molette, une version pincement — et n'avait aucun test.
//
// C'est pourtant le genre de calcul où une erreur de signe ne se voit pas en
// lisant le code : le canevas part simplement de travers sous le curseur, et
// on met le défaut sur le compte du navigateur. D'où ces contrôles, qui
// énoncent la propriété voulue plutôt que la formule.
// ──────────────────────────────────────────────────────────────────────────

describe("borner", () => {
  it("respecte les deux bornes", () => {
    expect(borner(0.001)).toBe(ZOOM_MIN);
    expect(borner(1000)).toBe(ZOOM_MAX);
    expect(borner(1)).toBe(1);
  });
});

describe("distance", () => {
  it("mesure l'écartement de deux doigts", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("vaut zéro pour deux points confondus", () => {
    expect(distance({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0);
  });
});

describe("zoomAutourDuPoint", () => {
  it("laisse le point d'ancrage exactement où il était", () => {
    // LA propriété qui compte : ce qui est sous le curseur doit y rester.
    // On la vérifie en projetant le même point du canevas avant et après.
    const ancre = { x: 300, y: 200 };
    const panDepart = { x: -50, y: 120 };
    const scaleDepart = 1;

    const { scale, pan } = zoomAutourDuPoint(scaleDepart, 2, panDepart, ancre);

    // Coordonnée dans le canevas du point qui était sous le curseur…
    const dansLeCanevas = {
      x: (ancre.x - panDepart.x) / scaleDepart,
      y: (ancre.y - panDepart.y) / scaleDepart,
    };
    // …reprojetée après le zoom : elle doit retomber sur le curseur.
    expect(dansLeCanevas.x * scale + pan.x).toBeCloseTo(ancre.x, 9);
    expect(dansLeCanevas.y * scale + pan.y).toBeCloseTo(ancre.y, 9);
  });

  it("tient la promesse aussi en dézoomant, et hors origine", () => {
    const cas: [number, number, { x: number; y: number }, { x: number; y: number }][] = [
      [2, 0.5, { x: 400, y: -200 }, { x: 30, y: 700 }],
      [0.4, 1.3, { x: -10, y: -10 }, { x: 0, y: 0 }],
      [1, 1, { x: 55, y: 66 }, { x: 120, y: 340 }],
    ];
    for (const [scaleDepart, voulu, panDepart, ancre] of cas) {
      const { scale, pan } = zoomAutourDuPoint(scaleDepart, voulu, panDepart, ancre);
      const cx = (ancre.x - panDepart.x) / scaleDepart;
      const cy = (ancre.y - panDepart.y) / scaleDepart;
      expect(cx * scale + pan.x).toBeCloseTo(ancre.x, 9);
      expect(cy * scale + pan.y).toBeCloseTo(ancre.y, 9);
    }
  });

  it("ne bouge pas le canevas quand l'échelle ne change pas", () => {
    const pan = { x: 12, y: -34 };
    const r = zoomAutourDuPoint(1, 1, pan, { x: 200, y: 100 });
    expect(r.pan).toEqual(pan);
    expect(r.scale).toBe(1);
  });

  it("borne l'échelle demandée", () => {
    expect(zoomAutourDuPoint(1, 99, { x: 0, y: 0 }, { x: 0, y: 0 }).scale).toBe(ZOOM_MAX);
    expect(zoomAutourDuPoint(1, 0.001, { x: 0, y: 0 }, { x: 0, y: 0 }).scale).toBe(ZOOM_MIN);
  });

  it("suit l'ancre quand elle se déplace — le cas du pincement", () => {
    // Pendant un pincement, le milieu des deux doigts glisse. Le canevas doit
    // suivre ce glissement en plus de changer d'échelle : c'est ce qui
    // distingue le pincement de la molette.
    const panDepart = { x: 0, y: 0 };
    const depart = { x: 100, y: 100 };
    const courante = { x: 160, y: 130 };

    const fixe = zoomAutourDuPoint(1, 2, panDepart, depart);
    const suivie = zoomAutourDuPoint(1, 2, panDepart, depart, courante);

    // À échelle égale, l'écart de décalage est exactement le déplacement du
    // milieu des doigts.
    expect(suivie.pan.x - fixe.pan.x).toBeCloseTo(courante.x - depart.x, 9);
    expect(suivie.pan.y - fixe.pan.y).toBeCloseTo(courante.y - depart.y, 9);
  });

  it("sans déplacement de l'ancre, le pincement se comporte comme la molette", () => {
    const a = zoomAutourDuPoint(1.5, 3, { x: 20, y: 40 }, { x: 250, y: 250 });
    const b = zoomAutourDuPoint(1.5, 3, { x: 20, y: 40 }, { x: 250, y: 250 }, { x: 250, y: 250 });
    expect(b).toEqual(a);
  });
});
