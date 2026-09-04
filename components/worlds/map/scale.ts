// L'échelle d'une carte et les distances qu'on y mesure, en fonctions pures.
//
// Une carte sans échelle est un dessin ; avec, elle répond à « c'est loin ? ».
// L'échelle se note par ce que représente la LARGEUR entière de la carte —
// « 1 200 km » — plutôt qu'en pixels par unité : l'image est servie à
// plusieurs largeurs selon l'écran (voir `MAP_WIDTH_TIERS`), et un pixel n'y
// vaut donc jamais la même chose. Un pourcentage de la largeur, si.

import type { Point } from "./zoom";

/** Ce que la largeur de la carte représente, et en quoi. */
export type MapScale = { widthUnits: number; unit: string };

/**
 * Longueur d'un segment entre deux points de la carte, en pourcentage de sa
 * LARGEUR.
 *
 * Les points sont en pourcentages de chaque axe — le repère des épingles —,
 * et 10 % de hauteur ne font pas 10 % de largeur sur une carte oblongue :
 * `aspect` (hauteur / largeur) ramène la hauteur à la largeur. Un rapport
 * inconnu — la carte n'est pas encore mesurée — vaut 1, faute de mieux.
 */
export function segmentLength(a: Point, b: Point, aspect: number): number {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  return Math.hypot(b.x - a.x, (b.y - a.y) * ratio);
}

/** La distance entre deux points, en unités du monde. */
export function distanceBetween(a: Point, b: Point, aspect: number, scale: MapScale): number {
  return (segmentLength(a, b, aspect) / 100) * scale.widthUnits;
}

/**
 * Ce que vaut la largeur de la carte quand le segment `a`–`b` mesure
 * `declared` unités — c'est ainsi qu'on règle l'échelle : on mesure une
 * distance connue, et on dit combien elle fait.
 *
 * `null` quand rien ne se déduit : segment nul, ou distance déclarée nulle,
 * négative ou absurde.
 */
export function calibrateWidthUnits(a: Point, b: Point, aspect: number, declared: number): number | null {
  const longueur = segmentLength(a, b, aspect);
  if (!(longueur > 0) || !(declared > 0) || !Number.isFinite(declared)) return null;
  return (declared * 100) / longueur;
}

/**
 * Arrondi lisible : les grandes distances en entiers, les petites avec une
 * décimale, les toutes petites avec deux. « 1 234,567 km » n'apprend rien
 * de plus que « 1 235 km ».
 */
export function roundDistance(value: number): number {
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

export function formatDistance(value: number, unit: string, locale?: string): string {
  const nombre = roundDistance(value).toLocaleString(locale, { maximumFractionDigits: 2 });
  return unit ? `${nombre} ${unit}` : nombre;
}

/**
 * La barre d'échelle : un nombre ROND d'unités — 1, 2 ou 5 fois une puissance
 * de dix — dont la longueur à l'écran approche `targetPx` sans le dépasser.
 * Elle mesure donc entre les deux cinquièmes et la totalité de la cible, et
 * son libellé se lit d'un coup d'œil : « 50 km », jamais « 37,4 km ».
 *
 * @param pxPerUnit pixels à l'écran par unité du monde, à l'échelle courante
 */
export function scaleBarFor(pxPerUnit: number, targetPx = 120): { units: number; px: number } | null {
  if (!(pxPerUnit > 0) || !Number.isFinite(pxPerUnit)) return null;
  const brut = targetPx / pxPerUnit;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const mantisse = brut / puissance;
  const rond = mantisse >= 5 ? 5 : mantisse >= 2 ? 2 : 1;
  const units = rond * puissance;
  return { units, px: units * pxPerUnit };
}
