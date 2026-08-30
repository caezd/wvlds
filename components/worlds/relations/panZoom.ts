// Arithmétique du zoom du canevas de relations.
//
// Extraite parce qu'elle était écrite DEUX FOIS dans le composant, sous deux
// formes différentes : une pour la molette, une pour le pincement à deux
// doigts. Les deux répondent pourtant à la même question — comment déplacer le
// canevas pour qu'un point donné reste sous le curseur (ou entre les doigts)
// pendant que l'échelle change.
//
// Pure et sans React, donc vérifiable directement : voir `__tests__/panZoom.test.ts`.

/** Bornes de zoom. En deçà le canevas devient illisible, au-delà il n'a plus d'intérêt. */
export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 4;

export type Point = { x: number; y: number };

/** Ramène une échelle dans les bornes autorisées. */
export function borner(scale: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));
}

/**
 * Change l'échelle en gardant un point du viewport immobile.
 *
 * @param scaleDepart   échelle avant le geste
 * @param scaleVoulu    échelle demandée, avant bornage
 * @param panDepart     décalage du canevas avant le geste
 * @param ancreDepart   point du viewport à garder fixe, au début du geste
 * @param ancreCourante où ce point se trouve maintenant — il bouge pendant un
 *                      pincement (le milieu des deux doigts glisse), mais pas
 *                      sous la molette, d'où sa valeur par défaut
 */
export function zoomAutourDuPoint(
  scaleDepart: number,
  scaleVoulu: number,
  panDepart: Point,
  ancreDepart: Point,
  ancreCourante: Point = ancreDepart,
): { scale: number; pan: Point } {
  const scale = borner(scaleVoulu);
  const ratio = scale / scaleDepart;
  return {
    scale,
    pan: {
      x: ancreCourante.x - (ancreDepart.x - panDepart.x) * ratio,
      y: ancreCourante.y - (ancreDepart.y - panDepart.y) * ratio,
    },
  };
}

/** Distance entre deux doigts, pour le pincement. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
