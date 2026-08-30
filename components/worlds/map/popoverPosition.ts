import type { PinPopoverPos } from "./types";

/** Encombrement du panneau flottant d'un point, et marge minimale au bord. */
export const CARTE_L = 340;
export const CARTE_H = 460;
export const MARGE = 12;

/**
 * Place le panneau d'un point à côté du clic, sans le laisser sortir de l'écran.
 *
 * À droite du curseur par défaut ; à gauche s'il déborderait. Verticalement
 * centré sur le clic, puis ramené entre les bords.
 *
 * Le viewport est un paramètre plutôt qu'une lecture directe de `window` : la
 * fonction devient pure, donc vérifiable sans navigateur — voir
 * `__tests__/popoverPosition.test.ts`.
 */
export function calcPopoverPos(
  clientX: number,
  clientY: number,
  viewport: { largeur: number; hauteur: number } = {
    largeur: window.innerWidth,
    hauteur: window.innerHeight,
  },
): PinPopoverPos {
  let left = clientX + 16;
  if (left + CARTE_L > viewport.largeur - MARGE) left = clientX - CARTE_L - 16;

  // Ramener DANS l'écran après la bascule.
  //
  // Ce bornage manquait, alors que son équivalent vertical était bien là. Sur
  // un écran étroit, la bascule à gauche donnait un `left` négatif : mesuré sur
  // 375 px de large, un clic à x=40 ne laissait que 24 pixels du panneau sur
  // 340 à l'écran. Autant dire invisible — et son bouton de fermeture avec.
  //
  // `Math.max` en dernier : sur un écran plus étroit que le panneau lui-même,
  // aucune position ne le contient, et l'on préfère alors coller au bord
  // GAUCHE. Le panneau déborde à droite, mais son début reste lisible.
  left = Math.max(MARGE, Math.min(left, viewport.largeur - CARTE_L - MARGE));

  const top = Math.max(
    MARGE,
    Math.min(clientY - CARTE_H / 2, viewport.hauteur - CARTE_H - MARGE),
  );

  return { left, top };
}
