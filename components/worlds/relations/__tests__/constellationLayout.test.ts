import { describe, it, expect } from "vitest";
import { clusterCenters, constellationLayout, convexHull, isolatedPositions } from "../constellationLayout";
import type { Edge } from "../geometry";

const edge = (from: string, to: string): Edge =>
  ({ id: `${from}-${to}`, from, to, type: "t", directed: false, pending: false, rels: [] }) as unknown as Edge;

const input = (edges: Edge[], ids = ["a", "b", "c", "d", "e", "x"]) => ({
  personaIds: ids,
  edges,
  clusterOf: (id: string) => (["a", "b", "c"].includes(id) ? "u1" : "u2"),
  clusterOrder: ["u1", "u2"],
});

const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);

describe("constellationLayout", () => {
  const edges = [edge("a", "b"), edge("b", "c"), edge("d", "e"), edge("c", "d")];

  it("place chaque persona lié dans le plateau, et range à part ceux sans relation", async () => {
    const l = await constellationLayout(input(edges));
    expect(l.isolated).toEqual(["x"]);
    expect(l.isolatedTop).not.toBeNull();
    for (const id of ["a", "b", "c", "d", "e"]) {
      const p = l.pos.get(id)!;
      expect(p.x).toBeGreaterThanOrEqual(60);
      expect(p.x).toBeLessThanOrEqual(840);
      expect(p.y).toBeLessThan(l.isolatedTop!);
    }
    // L'isolé est sous tous les autres.
    expect(l.pos.get("x")!.y).toBeGreaterThan(l.isolatedTop!);
  });

  it("rapproche les personas liés", async () => {
    const l = await constellationLayout(input(edges));
    expect(dist(l.pos.get("a")!, l.pos.get("b")!)).toBeLessThan(dist(l.pos.get("a")!, l.pos.get("e")!));
  });

  it("est déterministe : mêmes données, même placement", async () => {
    const [l1, l2] = await Promise.all([constellationLayout(input(edges)), constellationLayout(input(edges))]);
    expect([...l1.pos]).toEqual([...l2.pos]);
  });

  it("un contour par îlot non vide, dans l'ordre des îlots", async () => {
    const l = await constellationLayout(input(edges));
    expect(l.clusters.map((c) => c.key)).toEqual(["u1", "u2"]);
    expect(l.clusters[0].ids).toEqual(["a", "b", "c"]);
    expect(l.clusters[0].outline).toMatch(/^M.* Z$/);
  });
});

describe("aides géométriques", () => {
  it("convexHull garde les sommets extérieurs", () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 5, y: 5 });
  });

  it("clusterCenters met l'îlot central au milieu", () => {
    const c = clusterCenters(["g1", "g2", "none"], "none");
    expect(c.get("none")).toEqual({ x: 450, y: 410 });
    expect(c.get("g1")).not.toEqual(c.get("g2"));
  });

  it("isolatedPositions range en rangées de douze", () => {
    const ids = Array.from({ length: 14 }, (_, i) => `i${i}`);
    const { pos } = isolatedPositions(ids);
    const ys = new Set([...pos.values()].map((p) => p.y));
    expect(ys.size).toBe(2);
  });
});
