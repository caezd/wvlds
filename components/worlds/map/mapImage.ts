// L'adresse de l'image d'une carte, à un palier de largeur donné.
//
// Ce calcul vit à part parce qu'il sert des DEUX CÔTÉS : le client, qui monte
// de palier en agrandissant, et le serveur, qui demande au navigateur de
// précharger le premier palier avant même que le composant existe. Les deux
// doivent produire exactement la même adresse — un caractère d'écart, et
// l'image serait téléchargée deux fois.

import { supabaseThumb } from "@/lib/storage";

/**
 * Les deux largeurs auxquelles une carte est servie.
 *
 * Deux, et pas une par taille d'écran : une largeur calculée produirait une
 * adresse par fenêtre, donc un téléchargement par fenêtre pour la même carte.
 */
export const MAP_WIDTH_TIERS = [1600, 2560];

/** Le palier servi d'emblée, avant toute mesure du cadre. */
export const MAP_WIDTH_FIRST_TIER = MAP_WIDTH_TIERS[0];

/**
 * L'image de la carte à ce palier — ou telle quelle au-delà du dernier.
 *
 * `supabaseThumb` rend l'URL inchangée pour un PNG et hors du seau public :
 * le `??` couvre ces deux cas plutôt que de laisser passer `undefined`.
 */
export function mapImageSrc(imageUrl: string | null | undefined, widthTier: number | null): string | null {
  if (!imageUrl) return null;
  if (widthTier === null) return imageUrl;
  return supabaseThumb(imageUrl, widthTier) ?? imageUrl;
}
