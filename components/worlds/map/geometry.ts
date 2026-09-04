// Les polygones d'une carte — les régions —, en fonctions pures.
//
// Les points sont en pourcentages de la carte, comme les épingles : les
// calculs ne connaissent ni pixels ni échelle, et se vérifient sans
// navigateur (voir `__tests__/geometry.test.ts`).

import type { Point } from "./zoom";

/** Un polygone en dessous n'est qu'un trait : trois sommets au moins. */
export const MIN_REGION_POINTS = 3;

/** Aire signée (lacets) : positive dans un sens, négative dans l'autre. */
export function polygonArea(points: Point[]): number {
  let aire = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    aire += a.x * b.y - b.x * a.y;
  }
  return aire / 2;
}

/**
 * Le centre d'un polygone, là où poser son nom.
 *
 * Pondéré par l'aire, et non la moyenne des sommets : sur un croissant ou
 * une côte découpée, la moyenne s'égare du côté où les sommets s'entassent.
 * Un polygone sans aire — tous les points alignés — retombe sur la moyenne,
 * faute de mieux.
 */
export function polygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const aire = polygonArea(points);
  if (Math.abs(aire) < 1e-9) {
    const somme = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: somme.x / points.length, y: somme.y / points.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const croix = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * croix;
    cy += (a.y + b.y) * croix;
  }
  return { x: cx / (6 * aire), y: cy / (6 * aire) };
}

/** Le point est-il dans le polygone ? Lancer de rayon, bords compris ou non selon le hasard des arêtes. */
export function pointInPolygon(p: Point, points: Point[]): boolean {
  let dedans = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    const traverse = a.y > p.y !== b.y > p.y;
    if (traverse && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/**
 * Retire les sommets posés (presque) au même endroit que le précédent — et
 * le dernier s'il rejoint le premier. Un double-clic pour fermer le tracé
 * pose deux fois le même point ; un tremblement de la main, deux points à un
 * demi-pourcent l'un de l'autre.
 */
export function dedupeConsecutive(points: Point[], epsilon = 0.5): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < epsilon) continue;
    out.push(p);
  }
  if (out.length > 1) {
    const premier = out[0];
    const dernier = out[out.length - 1];
    if (Math.hypot(dernier.x - premier.x, dernier.y - premier.y) < epsilon) out.pop();
  }
  return out;
}

/** Distance d'un point au segment [a, b]. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const longueur2 = dx * dx + dy * dy;
  if (longueur2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / longueur2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function rdp(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  const premier = points[0];
  const dernier = points[points.length - 1];
  let indexMax = 0;
  let distMax = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], premier, dernier);
    if (d > distMax) { distMax = d; indexMax = i; }
  }
  if (distMax <= tolerance) return [premier, dernier];
  const gauche = rdp(points.slice(0, indexMax + 1), tolerance);
  const droite = rdp(points.slice(indexMax), tolerance);
  return [...gauche.slice(0, -1), ...droite];
}

/**
 * Simplifie un tracé (Ramer–Douglas–Peucker) : les sommets qui ne dévient
 * pas de la ligne de plus de `tolerance` disparaissent. Un contour suivi à
 * la main compte vite cent points là où dix suffisent.
 *
 * Le polygone est fermé : on le coupe au sommet le plus éloigné du premier,
 * pour que la simplification ne rabote pas ce qui touche à la jointure. Ne
 * descend jamais sous `MIN_REGION_POINTS`.
 */
export function simplifyPolygon(points: Point[], tolerance = 0.3): Point[] {
  if (points.length <= MIN_REGION_POINTS) return points;
  let loin = 0;
  let distMax = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y);
    if (d > distMax) { distMax = d; loin = i; }
  }
  const premiereMoitie = rdp(points.slice(0, loin + 1), tolerance);
  const secondeMoitie = rdp([...points.slice(loin), points[0]], tolerance);
  const resultat = [...premiereMoitie.slice(0, -1), ...secondeMoitie.slice(0, -1)];
  return resultat.length >= MIN_REGION_POINTS ? resultat : points;
}

/** Le format de l'attribut `points` d'un `<polygon>`. */
export function toSvgPoints(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}
