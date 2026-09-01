import type { SortingStrategy } from "@dnd-kit/sortable";

/**
 * Les voisines ne bougent pas pendant un glissé.
 *
 * `verticalListSortingStrategy` les translate pour ouvrir le logement où
 * l'élément se posera. C'est ce qu'on veut presque partout — mais pas quand la
 * page vise le milieu d'un dossier : elle va y ENTRER, donc n'ouvrir aucun
 * logement entre deux lignes. Écarter les voisines promettrait alors une place
 * que le cadre du dossier dément dans le même instant.
 */
export const SANS_DEPLACEMENT: SortingStrategy = () => null;
