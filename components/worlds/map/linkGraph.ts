// Où poser les lieux voisins autour de celui qu'on regarde.
//
// La fiche d'un lieu dit ce qu'il est ; elle ne disait pas ce qu'il touche.
// Le petit graphique le montre d'un coup d'œil : le lieu ouvert au centre,
// ceux qui le rejoignent autour, et un trait entre eux.
//
// ── Les voisins gardent leur direction ───────────────────────
// Ils alternaient d'abord à droite puis à gauche, dans l'ordre des liens. Un
// lieu situé à l'ouest se retrouvait donc à droite du centre une fois sur
// deux : le graphique donnait une géographie fausse, et il en donne une —
// personne ne lit un plan comme une simple liste. Chaque voisin est
// désormais posé DANS SA DIRECTION, à une distance qui respecte l'ordre des
// éloignements.

import type { Point } from "./zoom";

/** Un lieu voisin, avec sa position sur la carte, en pourcentages. */
export type GraphNeighbour = { id: string; title: string; x: number; y: number };

/** Un lieu posé dans le cadre, en pourcentages de sa largeur et sa hauteur. */
export type GraphNode = { id: string; title: string; x: number; y: number; side: "left" | "right" };

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

/** Marges intérieures du cadre, en pourcentage. Plus haute que large : les
 *  étiquettes ont une hauteur, et le cadre est bas. */
export const MARGE = 3;
const MARGE_Y = 12;

/** Largeur maximale de la boîte du centre, en pourcentage du cadre. */
export const LARGEUR_CENTRE = 26;
/** Ce qui sépare au minimum une étiquette de la boîte du centre. */
const GOUTTIERE = 3;

/**
 * Les bords du couloir réservé au centre : aucune étiquette n'entre dedans.
 *
 * Sans lui, un voisin presque au nord — dont l'écart horizontal est quasi nul
 * — se posait sur le centre, et la liaison disparaissait sous les deux boîtes.
 */
export const BORD_GAUCHE = 50 - LARGEUR_CENTRE / 2 - GOUTTIERE;
export const BORD_DROIT = 50 + LARGEUR_CENTRE / 2 + GOUTTIERE;

/** L'écart vertical au-dessous duquel deux étiquettes du même côté se touchent. */
const ECART_MIN = 16;

/**
 * Ce qu'il faut au minimum à un nom pour se lire.
 *
 * L'étiquette pousse du nœud vers le bord : un voisin très à l'ouest se
 * retrouvait donc collé au bord, avec sept pour cent de large pour son nom.
 * L'écart horizontal est borné en conséquence — il ne reste qu'une bande, où
 * l'ordre des éloignements se lit encore, et c'est la hauteur qui porte
 * l'essentiel de la direction.
 */
export const LARGEUR_MIN_ETIQUETTE = 20;

/** Largeur disponible pour l'étiquette d'un nœud : elle pousse vers le bord. */
export function largeurEtiquette(node: GraphNode): number {
  return node.side === "left" ? node.x - MARGE : 100 - MARGE - node.x;
}

/**
 * Écarte les étiquettes d'un même côté qui se chevauchent.
 *
 * Deux voisins dans la même direction tombent à la même hauteur : leurs noms
 * se recouvrent, et aucun des deux ne se lit. Une passe descendante puis une
 * remontante — la façon habituelle de placer des étiquettes — les sépare en
 * les bougeant le moins possible, et les garde dans le cadre.
 */
function ecarter(ys: number[]): number[] {
  const bas = MARGE_Y;
  const haut = 100 - MARGE_Y;
  const out = [...ys].sort((a, b) => a - b);
  for (let i = 1; i < out.length; i++) {
    if (out[i] - out[i - 1] < ECART_MIN) out[i] = out[i - 1] + ECART_MIN;
  }
  // Le dernier peut avoir débordé : on remonte toute la file.
  const debord = out[out.length - 1] - haut;
  if (debord > 0) for (let i = 0; i < out.length; i++) out[i] -= debord;
  for (let i = 0; i < out.length; i++) out[i] = Math.max(bas, Math.min(haut, out[i]));
  return out;
}

/**
 * Répartit les voisins autour du lieu ouvert, chacun dans sa direction.
 *
 * `aspect` (hauteur / largeur de la carte) ramène les écarts verticaux à
 * l'échelle des horizontaux : sans lui, une carte oblongue ferait paraître
 * nord-sud ce qui est est-ouest.
 *
 * Une SEULE échelle pour les deux axes — le plus grand écart, vertical ou
 * horizontal, confondus — plutôt qu'une par axe : normalisés séparément, un
 * voisin à cent lieues à l'est et un autre à une lieue au nord se seraient
 * retrouvés l'un au bord, l'autre en haut, comme s'ils comptaient autant.
 *
 * Les deux axes n'ont pas la même amplitude pour autant : la hauteur est
 * libre, la largeur tient dans une bande étroite entre le couloir du centre
 * et la place qu'il faut aux noms. La direction et l'ordre des éloignements
 * se lisent ; les proportions exactes, non — c'est un schéma, la carte est
 * juste à côté.
 */
export function layoutLinkGraph(
  center: Point,
  neighbours: GraphNeighbour[],
  aspect: number,
): LinkGraphLayout {
  const retenus = neighbours.slice(0, MAX_NODES);
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

  const bruts = retenus.map((v) => ({
    voisin: v,
    dx: v.x - center.x,
    dy: (v.y - center.y) * ratio,
  }));
  const echelle = Math.max(...bruts.map((b) => Math.max(Math.abs(b.dx), Math.abs(b.dy))), 0);

  const nodes: GraphNode[] = bruts.map(({ voisin, dx, dy }) => {
    // Deux lieux au même endroit : rien ne dit où poser le second. À droite,
    // faute de direction — c'est le seul cas où le graphique invente.
    const ux = echelle > 0 ? dx / echelle : 0;
    const uy = echelle > 0 ? dy / echelle : 0;
    const side: "left" | "right" = dx < 0 ? "left" : "right";
    const bord = side === "left"
      ? MARGE + LARGEUR_MIN_ETIQUETTE
      : 100 - MARGE - LARGEUR_MIN_ETIQUETTE;
    const dedans = side === "left" ? BORD_GAUCHE : BORD_DROIT;

    return {
      id: voisin.id,
      title: voisin.title,
      // Entre le couloir du centre et la place qu'il faut à son nom.
      x: dedans + Math.abs(ux) * (bord - dedans),
      y: 50 + uy * (50 - MARGE_Y),
      side,
    };
  });

  for (const side of ["left", "right"] as const) {
    const memeCote = nodes.filter((n) => n.side === side);
    if (memeCote.length < 2) continue;
    const ordre = [...memeCote].sort((a, b) => a.y - b.y);
    const ys = ecarter(ordre.map((n) => n.y));
    ordre.forEach((n, i) => { n.y = ys[i]; });
  }

  return {
    center: { x: 50, y: 50 },
    nodes,
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
