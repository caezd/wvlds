/**
 * Quand la colonne latérale d'une page de wiki peut rester une colonne.
 *
 * Elle basculait en tiroir sous un point de rupture fixe (`xl`, 1280 px), qui
 * ne savait rien des deux colonnes voisines : à cette largeur, la navigation
 * dépliée et la colonne des notes ne laissaient au texte qu'une fraction de sa
 * mesure. Et les deux colonnes se redimensionnent à la poignée — un seuil en
 * pixels de fenêtre ne pouvait pas suivre.
 *
 * La règle porte donc sur ce qui compte vraiment : le corps de l'article
 * garde-t-il sa pleine mesure ? Tant qu'il l'a, la colonne reste ; dès qu'il
 * faudrait la lui prendre, elle se retire dans son tiroir.
 *
 * La zone mesurée est celle qui porte le corps ET la colonne. Sa largeur ne
 * dépend pas de la présence de la colonne — sans quoi retirer celle-ci
 * élargirait la zone, qui la ferait revenir, qui rétrécirait la zone.
 */

/** Mesure maximale du corps d'un article, en rem — celle d'un salon. */
const CORPS_REM = { etroit: 40, large: 48 } as const;

/** Gouttière du corps, de chaque côté : `px-2`, puis `px-4` à partir de `lg`. */
const GOUTTIERE_REM = { etroit: 0.5, large: 1 } as const;

/** Place qu'il faut au corps pour être à sa pleine mesure, gouttières comprises. */
export function mesurePleineDuCorps(grandEcran: boolean, rem: number): number {
  const cle = grandEcran ? "large" : "etroit";
  return (CORPS_REM[cle] + GOUTTIERE_REM[cle] * 2) * rem;
}

/**
 * La colonne tient-elle sans rogner sur le corps de l'article ?
 *
 * `largeurZone` vaut `null` tant que rien n'est mesuré — au rendu serveur, et
 * jusqu'au premier passage de l'observateur. `siInconnu` dit alors de quel
 * côté se tromper, et les deux colonnes ne répondent pas pareil :
 *
 * - la colonne des notes prend `false`. La monter pour la retirer ouvrirait
 *   deux fois le même canal Realtime, ce que supabase-js refuse.
 * - l'arbre des pages prend `true`. Il n'ouvre aucun canal, et une classe
 *   `lg:` lui sert de plancher : sur téléphone il reste caché de toute façon,
 *   sans clignoter le temps d'une image.
 */
export function laColonneTient({
  largeurZone,
  largeurColonne,
  grandEcran,
  rem,
  siInconnu = false,
}: {
  largeurZone: number | null;
  largeurColonne: number;
  grandEcran: boolean;
  rem: number;
  siInconnu?: boolean;
}): boolean {
  if (largeurZone === null) return siInconnu;
  return largeurZone - largeurColonne >= mesurePleineDuCorps(grandEcran, rem);
}
