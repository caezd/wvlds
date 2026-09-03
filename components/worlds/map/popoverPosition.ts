import type { PinPopoverPos } from "./types";

/**
 * Point d'ancrage à l'écran d'une épingle, d'après le rectangle occupé par la
 * carte.
 *
 * Le panneau se posait à l'endroit du CLIC, une fois pour toutes : déplacer ou
 * agrandir la carte ensuite le laissait sur place, à désigner un lieu qui
 * n'était plus dessous. Ancré sur l'épingle, il la suit — le rectangle mesuré
 * tenant déjà compte du déplacement et de l'échelle.
 */
export function pinAnchor(
  rect: { left: number; top: number; width: number; height: number },
  pin: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: rect.left + (pin.x / 100) * rect.width,
    y: rect.top + (pin.y / 100) * rect.height,
  };
}

/** Encombrement du panneau flottant d'un point, et marge minimale au bord. */
export const CARTE_L = 340;
/** Hauteur supposée tant que le panneau n'est pas monté et mesurable. */
export const CARTE_H = 460;
export const MARGE = 12;

/** Distance entre l'épingle et le bord du panneau — la flèche s'y loge. */
export const ECART_EPINGLE = 14;
/** Côté de la flèche (un carré pivoté d'un quart de tour). */
export const FLECHE = 12;
/** Distance minimale entre la flèche et un angle arrondi du panneau. */
const MARGE_FLECHE = FLECHE;

/**
 * Place le panneau d'un point AU-DESSUS de son épingle, ou en dessous à défaut
 * de place, centré sur elle.
 *
 * Il se posait auparavant sur le côté, à hauteur du clic : rien ne le reliait
 * visuellement au lieu qu'il décrit, et sur un écran étroit il recouvrait la
 * moitié de la carte sans qu'on sache de quelle épingle il parlait. Au-dessus,
 * flèche pointée vers le bas, le lien se lit d'un coup d'œil.
 *
 * `arrowLeft` est rendu séparément parce que le panneau, lui, se recale pour
 * rester à l'écran : près d'un bord, il glisse alors que l'épingle ne bouge pas,
 * et la flèche doit suivre l'épingle, pas le panneau.
 *
 * Le viewport et la hauteur du panneau sont des paramètres plutôt que des
 * lectures de `window` et du DOM : la fonction reste pure, donc vérifiable sans
 * navigateur — voir `__tests__/popoverPosition.test.ts`.
 */
export function calcPopoverPos(
  anchorX: number,
  anchorY: number,
  viewport: { largeur: number; hauteur: number } = {
    largeur: window.innerWidth,
    hauteur: window.innerHeight,
  },
  panelHeight: number = CARTE_H,
): PinPopoverPos {
  const requis = panelHeight + ECART_EPINGLE;
  const placeAuDessus = anchorY - MARGE;
  const placeEnDessous = viewport.hauteur - anchorY - MARGE;

  // Au-dessus par défaut : l'épingle est ainsi montrée par la flèche sans que
  // le panneau ne recouvre le nom affiché sous le marqueur. On bascule si la
  // place manque — et, quand elle manque des deux côtés, on garde le côté le
  // plus dégagé plutôt que de trancher au hasard.
  const auDessus = placeAuDessus >= requis || placeAuDessus >= placeEnDessous;

  const top = Math.max(
    MARGE,
    Math.min(
      auDessus ? anchorY - ECART_EPINGLE - panelHeight : anchorY + ECART_EPINGLE,
      viewport.hauteur - panelHeight - MARGE,
    ),
  );

  // Centré sur l'épingle, puis ramené DANS l'écran.
  //
  // `Math.max` en dernier : sur un écran plus étroit que le panneau lui-même,
  // aucune position ne le contient, et l'on préfère alors coller au bord
  // GAUCHE. Le panneau déborde à droite, mais son début reste lisible.
  const left = Math.max(
    MARGE,
    Math.min(anchorX - CARTE_L / 2, viewport.largeur - CARTE_L - MARGE),
  );

  const arrowLeft = Math.max(
    MARGE_FLECHE,
    Math.min(anchorX - left, CARTE_L - MARGE_FLECHE),
  );

  return { left, top, placement: auDessus ? "above" : "below", arrowLeft };
}
