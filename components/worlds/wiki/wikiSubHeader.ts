/**
 * Bandeau sous l'en-tête du wiki, en trois segments alignés sur les colonnes
 * du corps : les commandes de l'arbre à gauche, le fil d'Ariane au centre, les
 * onglets de la colonne latérale à droite.
 *
 * Ce n'est pas une barre unique traversant l'écran : chaque segment vit dans
 * SA colonne, sinon rien ne garantirait qu'il s'arrête au bon endroit — la
 * navigation se redimensionne, la colonne latérale aussi, et l'une comme
 * l'autre disparaissent selon la largeur. Trois segments de même hauteur, dans
 * trois colonnes contiguës, se lisent comme une seule ligne et le restent quoi
 * qu'il arrive aux largeurs.
 *
 * Le trait du bas est une ombre `inset` plutôt qu'une bordure : il reste DANS
 * la boîte, et les trois segments gardent donc exactement la même hauteur
 * quelle que soit leur garniture (voir aussi components/ui/tab-bar.tsx).
 */
export const WIKI_SUBHEADER =
  "flex h-10 shrink-0 items-center gap-1 px-2 shadow-[inset_0_-1px_0_0_var(--color-border)]";
