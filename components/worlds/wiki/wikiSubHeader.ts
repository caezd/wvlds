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

/**
 * Compteur posé sur un bouton du bandeau — nombre de pages, de fiches.
 *
 * Discret volontairement : il informe. La pastille pleine du bouton des
 * commentaires, elle, signale des fils ouverts, c'est-à-dire quelque chose à
 * faire — les deux ne doivent pas se confondre.
 */
export const WIKI_SUBHEADER_COUNT =
  "rounded-full bg-secondary px-1.5 text-[10px] font-medium text-muted-foreground";

/**
 * Pied d'une colonne du wiki — arbre des pages, panneau de notes, éditeur
 * d'article, commentaires.
 *
 * Partagé et non recopié : les quatre pieds sont côte à côte à l'écran, et
 * leurs traits doivent tomber sur la même ligne. Une valeur recopiée avait déjà
 * dérivé de quatre pixels, ce qui se voit immédiatement.
 */
export const WIKI_FOOTER =
  "flex shrink-0 items-center gap-1 border-t border-border-soft px-2 py-1.5";

/** Bouton de ce pied — mêmes mesures partout, pour la même raison. */
export const WIKI_FOOTER_BUTTON =
  "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground";
