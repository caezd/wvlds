import type { SortingStrategy } from "@dnd-kit/sortable";

/**
 * Les voisines ne bougent pas pendant un glissé.
 *
 * `verticalListSortingStrategy` les translate pour montrer où l'élément se
 * posera — un aperçu. Les listes du wiki affichent déjà un trait de dépôt, qui
 * le dit mieux : lui sait annoncer un changement de dossier ou de catégorie, ce
 * qu'un simple décalage vertical ne peut pas exprimer.
 *
 * Les deux ensemble ouvraient un espace de deux lignes là où il en fallait un
 * de quelques pixels — l'écart de la liste, plus celui que dnd-kit ménageait.
 */
export const SANS_DEPLACEMENT: SortingStrategy = () => null;
