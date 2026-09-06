import { describe, it, expect } from "vitest";

import { MAX_NODES, layoutLinkGraph, otherEnd } from "@/components/worlds/map/linkGraph";

function voisins(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, title: `Lieu ${i}` }));
}

describe("layoutLinkGraph", () => {
  it("pose un voisin seul en face du centre", () => {
    const { center, nodes } = layoutLinkGraph(voisins(1));

    expect(center).toEqual({ x: 50, y: 50 });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].side).toBe("right");
    expect(nodes[0].y).toBe(50);
  });

  it("les fait alterner de part et d'autre", () => {
    // Empilés d'un seul côté, deux voisins laisseraient la moitié du cadre
    // vide et se serreraient dans l'autre.
    const { nodes } = layoutLinkGraph(voisins(4));

    expect(nodes.map((n) => n.side)).toEqual(["right", "left", "right", "left"]);
  });

  it("les échelonne sans jamais les superposer", () => {
    const { nodes } = layoutLinkGraph(voisins(6));

    for (const side of ["left", "right"] as const) {
      const colonne = nodes.filter((n) => n.side === side).map((n) => n.y);
      expect(new Set(colonne).size).toBe(colonne.length);
      expect(Math.min(...colonne)).toBeGreaterThan(0);
      expect(Math.max(...colonne)).toBeLessThan(100);
    }
  });

  it("garde l'ordre des liens, quelle que soit la colonne", () => {
    const { nodes } = layoutLinkGraph(voisins(5));
    expect(nodes.map((n) => n.id)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
  });

  it("s'arrête où le cadre devient illisible, et compte les absents", () => {
    const { nodes, hidden } = layoutLinkGraph(voisins(MAX_NODES + 3));

    expect(nodes).toHaveLength(MAX_NODES);
    expect(hidden).toBe(3);
  });

  it("ne rend rien pour un lieu qui ne touche personne", () => {
    const { nodes, hidden } = layoutLinkGraph([]);
    expect(nodes).toEqual([]);
    expect(hidden).toBe(0);
  });
});

describe("otherEnd", () => {
  it("rend l'autre bout, de quelque côté qu'on parte", () => {
    const lien = { from_pin_id: "a", to_pin_id: "b" };
    expect(otherEnd(lien, "a")).toBe("b");
    expect(otherEnd(lien, "b")).toBe("a");
  });

  it("ne rend rien d'un lien qui ne passe pas par là", () => {
    expect(otherEnd({ from_pin_id: "a", to_pin_id: "b" }, "c")).toBeNull();
  });
});
