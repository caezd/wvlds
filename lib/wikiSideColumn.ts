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
const BODY_REM = { etroit: 40, large: 48 } as const;

/** Gouttière du corps, de chaque côté : `px-2`, puis `px-4` à partir de `lg`. */
const GUTTER_REM = { etroit: 0.5, large: 1 } as const;

/** Place qu'il faut au corps pour être à sa pleine mesure, gouttières comprises. */
export function fullBodyMeasure(largeScreen: boolean, rem: number): number {
  const cle = largeScreen ? "large" : "etroit";
  return (BODY_REM[cle] + GUTTER_REM[cle] * 2) * rem;
}

/**
 * La colonne tient-elle sans rogner sur le corps de l'article ?
 *
 * `zoneWidth` vaut `null` tant que rien n'est mesuré — au rendu serveur, et
 * jusqu'au premier passage de l'observateur. On répond alors « non » pour les
 * deux colonnes : mieux vaut les voir arriver que partir, et la colonne des
 * notes ne peut de toute façon pas se permettre d'être montée pour rien —
 * deux panneaux ouvrent deux fois le même canal Realtime, ce que supabase-js
 * refuse.
 *
 * Aucune classe `lg:` ne double cette règle. Un plancher CSS a existé, pour
 * éviter que l'arbre des pages ne clignote sur téléphone avant la mesure : il
 * contredisait la mesure sur toute une bande de largeurs, où la règle disait
 * « en colonne » — donc pas de bouton de tiroir — pendant que le CSS la
 * cachait. Ni colonne ni bouton.
 */
export function columnFits({
  zoneWidth,
  columnWidth,
  largeScreen,
  rem,
}: {
  zoneWidth: number | null;
  columnWidth: number;
  largeScreen: boolean;
  rem: number;
}): boolean {
  if (zoneWidth === null) return false;
  return zoneWidth - columnWidth >= fullBodyMeasure(largeScreen, rem);
}
