// Arithmétique du zoom du plateau des relations.
//
// Le plateau ne s'agrandit pas par `transform: scale()` — le texte y devient
// flou — mais pour de vrai : sa largeur vaut `base × zoom`, et un décalage
// (`pan`) le déplace depuis le centre de la fenêtre. Zoomer autour d'un point
// revient donc à garder fixe, sous ce point, le même endroit du plateau.
//
// Pure et sans React, donc vérifiable directement : voir `__tests__/panZoom.test.ts`.

/** Bornes du zoom : de la moitié à cinq fois la taille de la fenêtre. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 5;
/** Un cran de molette. */
export const WHEEL_FACTOR = 1.2;
/** Un clic sur les boutons + et −. */
export const BUTTON_FACTOR = 1.25;

export type Point = { x: number; y: number };
export type View = { zoom: number; pan: Point };

/** Ramène un zoom dans les bornes autorisées. */
export function clampZoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

/**
 * Change le zoom en gardant un point de la fenêtre immobile.
 *
 * @param view    zoom et décalage avant le geste ; le décalage est celui du
 *                centre du plateau par rapport au centre de la fenêtre
 * @param factor  multiplicateur demandé, avant bornage
 * @param anchor  point à garder fixe, relatif au centre de la fenêtre
 * @param anchorNow où ce point se trouve maintenant — il bouge pendant un
 *                pincement (le milieu des deux doigts glisse), pas sous la molette
 */
export function zoomAround(view: View, factor: number, anchor: Point, anchorNow: Point = anchor): View {
  const zoom = clampZoom(view.zoom * factor);
  const r = zoom / view.zoom;
  return {
    zoom,
    pan: { x: anchorNow.x - (anchor.x - view.pan.x) * r, y: anchorNow.y - (anchor.y - view.pan.y) * r },
  };
}

/**
 * Le zoom et le décalage qui amènent un point du repère (900 × 900) au
 * centre de la fenêtre.
 *
 * @param base  côté du plateau à 100 % (le plus petit côté de la fenêtre)
 */
export function focusView(point: Point, zoom: number, base: number, viewSize = 900): View {
  const z = clampZoom(zoom);
  const w = base * z;
  return { zoom: z, pan: { x: -(point.x / viewSize - 0.5) * w, y: -(point.y / viewSize - 0.5) * w } };
}

/** Distance entre deux doigts, pour le pincement. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
