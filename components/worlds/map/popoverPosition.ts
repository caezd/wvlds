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
 * Largeur réellement occupée par le panneau.
 *
 * Il mesure 340 px, ce qui déborde d'un téléphone étroit : sur 320 px d'écran,
 * il ne restait pas de quoi le poser entre les marges, et on le collait au bord
 * gauche en le laissant sortir à droite. Il se resserre désormais — la feuille
 * de style applique exactement le même calcul, `min(340px, 100vw - 24px)`.
 */
export function largeurPanneau(largeurEcran: number): number {
  return Math.min(CARTE_L, Math.max(0, largeurEcran - 2 * MARGE));
}

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

  // Centré sur l'épingle, puis ramené DANS l'écran. Le panneau se resserrant
  // sur un écran étroit, il y tient toujours entier.
  const largeur = largeurPanneau(viewport.largeur);
  const left = Math.max(
    MARGE,
    Math.min(anchorX - largeur / 2, viewport.largeur - largeur - MARGE),
  );

  // La flèche reste dans le panneau, angles arrondis compris — et le panneau
  // peut être plus étroit que deux fois cette marge sur un très petit écran.
  const marge = Math.min(MARGE_FLECHE, largeur / 2);
  const arrowLeft = Math.max(marge, Math.min(anchorX - left, largeur - marge));

  return { left, top, placement: auDessus ? "above" : "below", arrowLeft };
}
