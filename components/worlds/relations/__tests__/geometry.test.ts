import { describe, it, expect } from "vitest";

import {
  ARC_R,
  CENTER,
  CHORD_R,
  FOCUS_R2,
  FOCUS_SIZES,
  PLAYER_GAP,
  RING_LABEL_MAX_R,
  RING_R,
  arcPath,
  arrowPath,
  arrowScale,
  avatarRadius,
  chordCurve,
  focusCurve,
  focusLabelPoint,
  focusLayout,
  focusR1,
  inwardLabel,
  labelWidth,
  mergeEdges,
  outwardLabel,
  pairOffsets,
  polar,
  quadAt,
  ringLabelPoint,
  ringLayout,
  spreadLabels,
  toPercent,
  type Point,
} from "../geometry";
import type { CRelation } from "../types";

// ──────────────────────────────────────────────────────────────────────────
// Ce qui est vérifié ici, ce n'est pas une apparence — impossible à assurer
// depuis jsdom, qui ne fait aucune mise en page — mais les invariants qui la
// produisent : les personas d'un joueur se suivent sous son arc, deux joueurs
// sont séparés d'un vide, une corde longue passe près du centre, une
// étiquette ne recouvre pas sa voisine, et deux sens d'une même relation ne
// font qu'un trait.
// ──────────────────────────────────────────────────────────────────────────

const TYPES = new Map([
  ["ami", { mutual: false }],
  ["rival", { mutual: false }],
  ["couple", { mutual: true }],
]);

let seq = 0;
function rel(from: string, to: string, type: string, status: CRelation["status"] = "accepted"): CRelation {
  return { id: `r${++seq}`, from_persona_id: from, to_persona_id: to, type, label: null, description: null, status };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const fromCenter = (p: Point) => dist(p, CENTER);
/** Écart angulaire, ramené dans [0, 360). */
const norm = (a: number) => ((a % 360) + 360) % 360;

describe("mergeEdges", () => {
  it("fond les deux sens d'un même type en un lien sans sens", () => {
    const edges = mergeEdges([rel("a", "b", "ami"), rel("b", "a", "ami")], TYPES);
    expect(edges).toHaveLength(1);
    expect(edges[0].directed).toBe(false);
    expect(edges[0].rels).toHaveLength(2);
  });

  it("garde deux liens pour deux sens de types différents", () => {
    const edges = mergeEdges([rel("a", "b", "ami"), rel("b", "a", "rival")], TYPES);
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.directed)).toBe(true);
  });

  it("un type réciproque n'a pas de sens, même d'un seul côté", () => {
    expect(mergeEdges([rel("a", "b", "couple")], TYPES)[0].directed).toBe(false);
  });

  it("sépare une demande en attente d'une relation acceptée", () => {
    expect(mergeEdges([rel("a", "b", "ami"), rel("b", "a", "ami", "pending")], TYPES)).toHaveLength(2);
  });

  it("ignore une relation d'un persona vers lui-même", () => {
    expect(mergeEdges([rel("a", "a", "ami")], TYPES)).toHaveLength(0);
  });
});

describe("repère", () => {
  it("polar part de la droite et tourne dans le sens horaire (y vers le bas)", () => {
    const right = polar(0, 100), down = polar(90, 100), up = polar(-90, 100);
    expect(right.x).toBeCloseTo(550);
    expect(right.y).toBeCloseTo(450);
    expect(down.y).toBeCloseTo(550);
    expect(up.y).toBeCloseTo(350);
  });

  it("toPercent ramène le repère de 900 à 100 %", () => {
    expect(toPercent({ x: 450, y: 900 })).toEqual({ left: 50, top: 100 });
  });

  it("arcPath prend le grand arc au-delà de 180°", () => {
    expect(arcPath(0, 90, 100)).toMatch(/ 0 0 1 /);
    expect(arcPath(0, 270, 100)).toMatch(/ 0 1 1 /);
  });

  it("quadAt passe par les extrémités", () => {
    const a = { x: 0, y: 0 }, c = { x: 50, y: 100 }, b = { x: 100, y: 0 };
    expect(quadAt(a, c, b, 0)).toEqual(a);
    expect(quadAt(a, c, b, 1)).toEqual(b);
    expect(quadAt(a, c, b, 0.5)).toEqual({ x: 50, y: 50 });
  });
});

describe("ringLayout", () => {
  const players = [
    { userId: "u1", personaIds: ["a", "b", "c"] },
    { userId: "u2", personaIds: [] },
    { userId: "u3", personaIds: ["d", "e"] },
  ];
  const ring = ringLayout(players);

  it("partage le tour entre personas et vides entre joueurs", () => {
    expect(ring.step).toBeCloseTo(360 / (5 + 2 * PLAYER_GAP));
    // Un joueur sans persona n'a pas d'arc.
    expect(ring.arcs.map((a) => a.userId)).toEqual(["u1", "u3"]);
  });

  it("commence en haut, un demi-vide après -90°", () => {
    expect(ring.arcs[0].a0).toBeCloseTo(-90 + (ring.step * PLAYER_GAP) / 2);
    expect(ring.angles.get("a")).toBeCloseTo(ring.arcs[0].a0 + ring.step / 2);
  });

  it("place les personas d'un joueur à un pas d'écart, sous son arc", () => {
    const [a, b, c] = ["a", "b", "c"].map((id) => ring.angles.get(id)!);
    expect(b - a).toBeCloseTo(ring.step);
    expect(c - b).toBeCloseTo(ring.step);
    for (const x of [a, b, c]) {
      expect(x).toBeGreaterThan(ring.arcs[0].a0);
      expect(x).toBeLessThan(ring.arcs[0].a1);
    }
    expect(ring.arcs[0].mid).toBeCloseTo((ring.arcs[0].a0 + ring.arcs[0].a1) / 2);
  });

  it("laisse un vide de PLAYER_GAP pas entre deux joueurs, et referme le tour", () => {
    expect(ring.arcs[1].a0 - ring.arcs[0].a1).toBeCloseTo(PLAYER_GAP * ring.step);
    expect(ring.arcs[1].a1 + (PLAYER_GAP * ring.step) / 2).toBeCloseTo(270);
  });

  it("mesure la place d'un avatar en cqw (longueur d'arc d'un pas / 9)", () => {
    expect(ring.spacing).toBeCloseTo((RING_R * ring.step * Math.PI) / 180 / 9);
  });

  it("ne casse pas sans aucun persona", () => {
    const empty = ringLayout([]);
    expect(empty.angles.size).toBe(0);
    expect(empty.arcs).toEqual([]);
  });
});

describe("chordCurve", () => {
  it("part et arrive sur le rayon des cordes", () => {
    const c = chordCurve(-90, 30);
    expect(fromCenter(c.a)).toBeCloseTo(CHORD_R);
    expect(fromCenter(c.b)).toBeCloseTo(CHORD_R);
  });

  it("tire une corde longue vers le centre, laisse presque plate celle entre voisins", () => {
    const across = chordCurve(0, 180);
    const neighbours = chordCurve(0, 10);
    // Diamètre : le contrôle tombe sur le centre.
    expect(fromCenter(across.c)).toBeCloseTo(0, 0);
    // Voisins : le contrôle reste près du milieu de la corde.
    const mid = { x: (neighbours.a.x + neighbours.b.x) / 2, y: (neighbours.a.y + neighbours.b.y) / 2 };
    expect(fromCenter(neighbours.c) / fromCenter(mid)).toBeGreaterThan(0.8);
  });

  it("courbe davantage avec une tension plus forte", () => {
    const soft = chordCurve(0, 120, 0.1), hard = chordCurve(0, 120, 0.7);
    expect(fromCenter(soft.c)).toBeLessThan(fromCenter(hard.c));
  });

  it("donne un chemin SVG quadratique", () => {
    expect(chordCurve(0, 90).d).toMatch(/^M[\d.]+ [\d.]+ Q[\d.]+ [\d.]+ [\d.]+ [\d.]+$/);
  });
});

describe("arrowPath / arrowScale", () => {
  it("pose la pointe sur l'extrémité, orientée selon la tangente", () => {
    const d = arrowPath({ x: 100, y: 0 }, { x: 0, y: 0 }, 10, 4);
    expect(d.startsWith("M100.0 0.0 L90.0 4.0")).toBe(true);
    expect(d.endsWith("90.0 -4.0 Z")).toBe(true);
  });

  it("rapetisse la flèche quand on zoome, jamais en dessous de la taille de base", () => {
    expect(arrowScale(0.5)).toBe(1);
    expect(arrowScale(1)).toBe(1);
    expect(arrowScale(4)).toBe(3);
  });
});

describe("étiquettes radiales", () => {
  it("un nom de persona à droite part du cercle, tourné selon l'angle", () => {
    const l = outwardLabel(0, RING_R);
    expect(l.origin).toBe("0 50%");
    expect(l.transform).toBe("translate(0,-50%) rotate(0.0deg)");
  });

  it("à gauche, il est retourné pour ne pas se lire la tête en bas", () => {
    const l = outwardLabel(180, RING_R);
    expect(l.origin).toBe("100% 50%");
    expect(l.transform).toBe("translate(-100%,-50%) rotate(360.0deg)");
  });

  it("le nom d'un joueur s'achève sur son ancre, vers le centre", () => {
    expect(inwardLabel(0, ARC_R).transform).toMatch(/^translate\(-100%,-50%\)/);
    expect(inwardLabel(180, ARC_R).transform).toMatch(/^translate\(0,-50%\)/);
  });
});

describe("étiquettes de type", () => {
  it("ringLabelPoint se pose côté cible, ramené à l'intérieur du cercle", () => {
    const c = chordCurve(-90, -60);
    const p = ringLabelPoint(c, true);
    expect(fromCenter(p)).toBeLessThanOrEqual(RING_LABEL_MAX_R + 1e-6);
    // Aux 7/10 depuis le persona mis en avant : plus près de b que de a.
    expect(dist(p, c.b)).toBeLessThan(dist(p, c.a));
    expect(dist(ringLabelPoint(c, false), c.a)).toBeLessThan(dist(ringLabelPoint(c, false), c.b));
  });

  it("labelWidth croît avec le texte", () => {
    expect(labelWidth("Ami")).toBeLessThan(labelWidth("Ami d'enfance"));
  });

  it("spreadLabels écarte deux étiquettes superposées d'une ligne", () => {
    const placed = spreadLabels([
      { x: 100, y: 100, w: 60, id: "a" },
      { x: 110, y: 105, w: 60, id: "b" },
      { x: 400, y: 100, w: 60, id: "c" },
    ]);
    const y = (id: string) => placed.find((l) => l.id === id)!.y;
    expect(y("a")).toBe(100);
    expect(y("b")).toBe(127);
    // Assez loin de côté : elle ne bouge pas.
    expect(y("c")).toBe(100);
  });

  it("spreadLabels ne laisse aucune paire se chevaucher", () => {
    const labels = Array.from({ length: 8 }, (_, i) => ({ x: 200 + (i % 2) * 10, y: 200 + i, w: 80 }));
    const placed = spreadLabels(labels);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const overlap = Math.abs(placed[i].x - placed[j].x) < (placed[i].w + placed[j].w) / 2 + 4 && Math.abs(placed[i].y - placed[j].y) < 22;
        expect(overlap).toBe(false);
      }
    }
  });
});

describe("focusLayout", () => {
  const typeOrder = new Map([["couple", 0], ["ami", 1], ["rival", 2]]);

  it("met le persona au centre, ses voisins sur le premier anneau, triés par type", () => {
    const edges = mergeEdges([rel("f", "a", "ami"), rel("f", "b", "couple"), rel("c", "f", "rival")], TYPES);
    const l = focusLayout("f", edges, typeOrder);
    expect(l.pos.get("f")).toEqual(CENTER);
    expect(l.sizes.get("f")).toBe(FOCUS_SIZES.center);
    expect(l.neighbors).toEqual(["b", "a", "c"]);
    for (const id of l.neighbors) expect(fromCenter(l.pos.get(id)!)).toBeCloseTo(focusR1(3));
    // Le premier en haut, puis à intervalles égaux.
    expect(l.angles.get("b")).toBe(-90);
    expect(l.angles.get("a")).toBe(30);
    expect(l.r2).toBeNull();
  });

  it("élargit le premier anneau au-delà de dix voisins, et rapetisse les avatars au-delà de quatorze", () => {
    expect(focusR1(10)).toBe(215);
    expect(focusR1(11)).toBe(245);
    const many = Array.from({ length: 15 }, (_, i) => rel("f", `n${i}`, "ami"));
    const l = focusLayout("f", mergeEdges(many, TYPES), typeOrder);
    expect(l.sizes.get("n0")).toBe(FOCUS_SIZES.directMany);
  });

  it("range le second degré en éventail autour de son parent, sur le second anneau", () => {
    const edges = mergeEdges([rel("f", "a", "ami"), rel("a", "x", "ami"), rel("a", "y", "ami"), rel("x", "y", "ami")], TYPES);
    const l = focusLayout("f", edges, typeOrder);
    expect(l.parentOf.get("x")).toBe("a");
    expect(l.parentOf.get("y")).toBe("a");
    expect(l.r2).toBe(FOCUS_R2);
    expect(fromCenter(l.pos.get("x")!)).toBeCloseTo(FOCUS_R2);
    // De part et d'autre de l'angle du parent (en haut, -90°).
    const ax = norm(Math.atan2(l.pos.get("x")!.y - CENTER.y, l.pos.get("x")!.x - CENTER.x) * 180 / Math.PI);
    const ay = norm(Math.atan2(l.pos.get("y")!.y - CENTER.y, l.pos.get("y")!.x - CENTER.x) * 180 / Math.PI);
    expect((ax + ay) / 2).toBeCloseTo(270);
    // x–y (entre deux personas du second anneau) n'est pas tracé.
    expect(l.edges.map((e) => [e.edge.from, e.edge.to, e.second])).toEqual([
      ["f", "a", false], ["a", "x", true], ["a", "y", true],
    ]);
  });

  it("ne range pas au second anneau un voisin direct", () => {
    const edges = mergeEdges([rel("f", "a", "ami"), rel("f", "b", "ami"), rel("a", "b", "ami")], TYPES);
    const l = focusLayout("f", edges, typeOrder);
    expect(l.parentOf.size).toBe(0);
  });
});

describe("liens de la vue Centré", () => {
  it("pairOffsets écarte en éventail plusieurs types d'une même paire", () => {
    const edges = mergeEdges([rel("f", "a", "ami"), rel("f", "a", "couple"), rel("f", "b", "ami")], TYPES);
    const off = pairOffsets(edges);
    expect(off.get(edges[0].id)).toBeCloseTo(-0.1);
    expect(off.get(edges[1].id)).toBeCloseTo(0.1);
    expect(off.get(edges[2].id)).toBe(0);
  });

  it("focusCurve s'arrête au bord des deux avatars", () => {
    const a = { x: 0, y: 0 }, b = { x: 200, y: 0 };
    const c = focusCurve(a, b, 20, 30, 0);
    expect(dist(c.a, a)).toBeCloseTo(20);
    expect(dist(c.b, b)).toBeCloseTo(30);
  });

  it("avatarRadius convertit un diamètre en cqw vers le repère", () => {
    expect(avatarRadius(2, 0)).toBe(9);
    expect(avatarRadius(2)).toBe(14);
  });

  it("focusLabelPoint pose l'étiquette entre le centre et l'anneau, plus bas sous le centre", () => {
    const r1 = 215;
    const up = focusCurve(CENTER, polar(-90, r1), 40, 25, 0);
    const down = focusCurve(CENTER, polar(90, r1), 40, 25, 0);
    const pu = fromCenter(focusLabelPoint(up, true, -90, r1));
    const pd = fromCenter(focusLabelPoint(down, true, 90, r1));
    expect(pu).toBeGreaterThan(avatarRadius(FOCUS_SIZES.center, 0));
    expect(pu).toBeLessThan(r1);
    expect(pd).toBeGreaterThan(pu);
  });
});
