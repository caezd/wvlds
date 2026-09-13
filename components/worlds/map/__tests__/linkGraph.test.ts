import { describe, it, expect } from "vitest";

import {
  BORD_DROIT,
  BORD_GAUCHE,
  LARGEUR_MIN_ETIQUETTE,
  MAX_NODES,
  largeurEtiquette,
  layoutLinkGraph,
  otherEnd,
} from "@/components/worlds/map/linkGraph";

const CENTRE = { x: 50, y: 50 };

function voisin(id: string, x: number, y: number) {
  return { id, title: `Lieu ${id}`, x, y };
}

describe("layoutLinkGraph — la direction", () => {
  it("pose à gauche un lieu qui est à l'ouest", () => {
    // Les voisins alternaient droite, gauche, droite… : un lieu à l'ouest se
    // retrouvait à droite une fois sur deux, et le graphique donnait une
    // géographie fausse.
    const { nodes } = layoutLinkGraph(CENTRE, [voisin("a", 10, 50)], 1);

    expect(nodes[0].side).toBe("left");
    expect(nodes[0].x).toBeLessThan(50);
  });

  it("pose à droite un lieu qui est à l'est", () => {
    const { nodes } = layoutLinkGraph(CENTRE, [voisin("a", 90, 50)], 1);

    expect(nodes[0].side).toBe("right");
    expect(nodes[0].x).toBeGreaterThan(50);
  });

  it("garde le nord en haut et le sud en bas", () => {
    const { nodes } = layoutLinkGraph(CENTRE, [voisin("n", 60, 10), voisin("s", 60, 90)], 1);
    const [nord, sud] = nodes;

    expect(nord.y).toBeLessThan(50);
    expect(sud.y).toBeGreaterThan(50);
  });

  it("respecte l'ordre des éloignements", () => {
    const { nodes } = layoutLinkGraph(CENTRE, [voisin("loin", 95, 50), voisin("pres", 60, 50)], 1);
    const [loin, pres] = nodes;

    expect(loin.x - 50).toBeGreaterThan(pres.x - 50);
  });

  it("ramène les écarts verticaux à l'échelle des horizontaux", () => {
    // Sur une carte deux fois plus large que haute, 10 % de hauteur valent
    // 5 % de largeur : sans ce redressement, l'est-ouest passerait pour du
    // nord-sud.
    const plat = layoutLinkGraph(CENTRE, [voisin("a", 60, 60)], 0.25).nodes[0];
    const carre = layoutLinkGraph(CENTRE, [voisin("a", 60, 60)], 1).nodes[0];

    expect(plat.y - 50).toBeLessThan(carre.y - 50);
  });
});

describe("layoutLinkGraph — la place de chacun", () => {
  it("tient les étiquettes hors du couloir du centre", () => {
    // Un voisin presque plein nord a un écart horizontal quasi nul : posé là
    // où sa direction l'envoie, il se serait couché sur le centre.
    const { nodes } = layoutLinkGraph(CENTRE, [voisin("n", 50.1, 10), voisin("no", 49.9, 10)], 1);

    expect(nodes[0].x).toBeGreaterThanOrEqual(BORD_DROIT);
    expect(nodes[1].x).toBeLessThanOrEqual(BORD_GAUCHE);
  });

  it("écarte deux voisins d'un même côté qui tomberaient l'un sur l'autre", () => {
    const { nodes } = layoutLinkGraph(CENTRE, [voisin("a", 90, 50), voisin("b", 89, 50)], 1);

    expect(Math.abs(nodes[0].y - nodes[1].y)).toBeGreaterThan(10);
  });

  it("les garde dans le cadre en les écartant", () => {
    const serres = Array.from({ length: 4 }, (_, i) => voisin(`v${i}`, 90, 50 + i * 0.1));
    const { nodes } = layoutLinkGraph(CENTRE, serres, 1);

    for (const n of nodes) {
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(100);
    }
  });

  it("laisse toujours une étiquette lisible", () => {
    const { nodes } = layoutLinkGraph(CENTRE, [voisin("a", 50.1, 20), voisin("b", 5, 80)], 1);

    for (const n of nodes) {
      expect(largeurEtiquette(n)).toBeGreaterThanOrEqual(LARGEUR_MIN_ETIQUETTE);
    }
  });

  it("s'arrête où le cadre devient illisible, et compte les absents", () => {
    const trop = Array.from({ length: MAX_NODES + 3 }, (_, i) => voisin(`v${i}`, 10 + i * 8, 20));
    const { nodes, hidden } = layoutLinkGraph(CENTRE, trop, 1);

    expect(nodes).toHaveLength(MAX_NODES);
    expect(hidden).toBe(3);
  });

  it("ne rend rien pour un lieu que rien ne rejoint", () => {
    const { nodes, hidden } = layoutLinkGraph(CENTRE, [], 1);
    expect(nodes).toEqual([]);
    expect(hidden).toBe(0);
  });

  it("pose quand même un voisin superposé au centre", () => {
    // Rien ne dit où : le graphique le met à droite plutôt que de le perdre.
    const { nodes } = layoutLinkGraph(CENTRE, [voisin("a", 50, 50)], 1);

    expect(nodes).toHaveLength(1);
    expect(Number.isFinite(nodes[0].x)).toBe(true);
    expect(Number.isFinite(nodes[0].y)).toBe(true);
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
