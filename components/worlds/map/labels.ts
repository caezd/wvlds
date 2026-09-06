// Quels noms de lieux tiennent à l'écran sans se marcher dessus.
//
// Les noms sont affichés en permanence : deux lieux voisins se retrouvaient
// avec leurs étiquettes l'une sur l'autre, et aucune des deux ne se lisait.
// Les cartes appellent ce tri « decluttering » : on garde ce qui tient, on
// tait le reste — et l'on zoome pour en obtenir davantage, puisque
// l'écartement grandit avec l'échelle alors que l'étiquette, elle, garde sa
// taille.

import type { Point } from "./zoom";

/** Un lieu, réduit à ce qu'il faut pour placer son nom. */
export type LabelCandidate = {
  id: string;
  /** Position dans la carte, en pourcentages. */
  x: number;
  y: number;
  title: string;
};

/** Ce que mesure une étiquette à l'écran, en pixels. */
const HAUTEUR_PX = 20;
/** Largeur d'un caractère, à la louche, pour du 11 px. */
const LARGEUR_CARACTERE_PX = 6.2;
const MARGE_PX = 12;
/** La même borne que la classe `max-w-40` du marqueur. */
const LARGEUR_MAX_PX = 160;

function largeurDe(titre: string): number {
  return Math.min(LARGEUR_MAX_PX, titre.length * LARGEUR_CARACTERE_PX + MARGE_PX);
}

function seChevauchent(a: DOMRectLike, b: DOMRectLike): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

type DOMRectLike = { left: number; top: number; width: number; height: number };

/**
 * Les lieux dont le nom peut s'afficher sans en recouvrir un autre.
 *
 * `priority` passe en premier — le lieu ouvert garde son nom quoi qu'il
 * arrive, c'est celui qu'on est en train de regarder. Les autres suivent dans
 * l'ordre reçu, chacun gardant son nom s'il ne touche aucun de ceux déjà
 * retenus.
 *
 * Les positions sont celles de l'image affichée : `size` est sa taille à
 * l'échelle 1, `scale` l'agrandissement courant. Le résultat ne dépend donc
 * ni du déplacement de la carte ni de la fenêtre — deux lieux qui ne se
 * gênent pas ne se gêneront pas davantage une fois la carte déplacée.
 */
export function visibleLabels(
  pins: LabelCandidate[],
  size: { width: number; height: number },
  scale: number,
  priority?: string | null,
): Set<string> {
  const gardes = new Set<string>();
  if (!(size.width > 0) || !(scale > 0)) return gardes;

  const ordre = priority
    ? [...pins].sort((a, b) => (a.id === priority ? -1 : b.id === priority ? 1 : 0))
    : pins;

  const places: DOMRectLike[] = [];
  for (const pin of ordre) {
    const largeur = largeurDe(pin.title);
    // L'étiquette est centrée sous l'épingle.
    const rect: DOMRectLike = {
      left: (pin.x / 100) * size.width * scale - largeur / 2,
      top: (pin.y / 100) * size.height * scale,
      width: largeur,
      height: HAUTEUR_PX,
    };
    if (pin.id !== priority && places.some((autre) => seChevauchent(rect, autre))) continue;
    places.push(rect);
    gardes.add(pin.id);
  }
  return gardes;
}

/** Distance entre deux points de la carte, en pourcentages — pour les tests. */
export function ecart(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
