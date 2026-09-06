// Où poser les lieux voisins autour de celui qu'on regarde.
//
// La fiche d'un lieu dit ce qu'il est ; elle ne disait pas ce qu'il touche.
// Le petit graphique le montre d'un coup d'œil : le lieu ouvert au centre,
// ceux qui le rejoignent de part et d'autre, et un trait entre eux.
//
// Deux colonnes plutôt qu'un cercle : les noms sont horizontaux, et des
// étiquettes disposées en couronne se recouvrent dès qu'elles sont plus de
// quatre. En colonnes, elles s'empilent sans jamais se toucher.

/** Un lieu voisin, réduit à ce qu'il faut pour le placer et le nommer. */
export type GraphNeighbour = { id: string; title: string };

/** Un lieu posé dans le cadre, en pourcentages de sa largeur et sa hauteur. */
export type GraphNode = GraphNeighbour & {
  x: number;
  y: number;
  /** De quel côté du centre il se trouve — le texte s'aligne dessus. */
  side: "left" | "right";
};

export type LinkGraphLayout = {
  center: { x: number; y: number };
  nodes: GraphNode[];
  /** Combien de voisins n'ont pas trouvé place — voir `MAX_NODES`. */
  hidden: number;
};

/**
 * Au-delà, le cadre devient illisible : huit noms y tiennent, seize s'y
 * écrasent. Le compte des absents est rendu, pour que la fiche le dise.
 */
export const MAX_NODES = 8;

/** Marge intérieure du cadre, en pourcentage : les boîtes ne touchent pas le bord. */
const MARGE = 4;

/**
 * Répartit les voisins de part et d'autre du lieu ouvert.
 *
 * Ils alternent droite, gauche, droite… : deux voisins se font ainsi face
 * plutôt que de s'empiler d'un seul côté, et le premier de la liste est le
 * plus lisible. Dans chaque colonne, ils s'échelonnent régulièrement sur la
 * hauteur — `(i + 1) / (n + 1)` place un voisin seul au milieu, deux aux
 * tiers, et ainsi de suite.
 */
export function layoutLinkGraph(neighbours: GraphNeighbour[]): LinkGraphLayout {
  const retenus = neighbours.slice(0, MAX_NODES);
  const colonnes: Record<"left" | "right", GraphNeighbour[]> = { left: [], right: [] };
  retenus.forEach((voisin, i) => colonnes[i % 2 === 0 ? "right" : "left"].push(voisin));

  const nodes: GraphNode[] = [];
  for (const side of ["left", "right"] as const) {
    const colonne = colonnes[side];
    colonne.forEach((voisin, i) => {
      nodes.push({
        ...voisin,
        x: side === "left" ? MARGE : 100 - MARGE,
        y: (100 * (i + 1)) / (colonne.length + 1),
        side,
      });
    });
  }

  return {
    center: { x: 50, y: 50 },
    // Rendus dans l'ordre reçu : c'est celui des liens, et il ne doit pas
    // dépendre de la colonne où chacun est tombé.
    nodes: retenus.map((v) => nodes.find((n) => n.id === v.id)!),
    hidden: Math.max(0, neighbours.length - retenus.length),
  };
}

/**
 * Le voisin qu'un lien désigne, vu depuis `pinId` — un lien n'a pas de sens,
 * et l'épingle ouverte peut se trouver de l'un ou l'autre côté.
 */
export function otherEnd(link: { from_pin_id: string; to_pin_id: string }, pinId: string): string | null {
  if (link.from_pin_id === pinId) return link.to_pin_id;
  if (link.to_pin_id === pinId) return link.from_pin_id;
  return null;
}
