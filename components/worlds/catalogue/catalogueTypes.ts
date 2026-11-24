import type { WorldCatalogItem, WorldCatalogCategory } from "@/types/worlds";

/** Les deux catalogues d'un monde partagent toute leur mécanique. */
export type CatalogType = "inventory" | "skills";

/**
 * Objet ou compétence, tel qu'affiché dans une colonne du catalogue.
 *
 * `category_id` y est OBLIGATOIRE, là où il est facultatif sur la ligne de
 * base : la mécanique de glisser-déposer range chaque objet dans une colonne,
 * et « sans catégorie » est une colonne comme une autre — un `undefined` s'y
 * comporterait autrement qu'un `null`.
 */
export type CatalogItem = WorldCatalogItem & { category_id: string | null };

/** Catégorie fictive des éléments non classés. */
export const UNCAT = "__uncat__";

/** Rang dans le tableau : l'ancienne grille se lit colonne par colonne, puis par rang. */
function compareBoard(a: WorldCatalogCategory, b: WorldCatalogCategory): number {
  return a.column_index - b.column_index || a.sort_index - b.sort_index;
}

/**
 * Les catégories dans l'ordre du tableau, de gauche à droite.
 *
 * Le catalogue était une grille de trois colonnes où s'empilaient les
 * catégories ; la base garde ce couple (colonne, rang). Le tableau le lit
 * comme un seul ordre, sans rien réécrire tant qu'on ne déplace rien.
 *
 * Fonction pure — voir `__tests__/catalogueTypes.test.ts`.
 */
export function boardOrder(cats: readonly WorldCatalogCategory[]): WorldCatalogCategory[] {
  return [...cats].sort(compareBoard);
}

/**
 * Le tableau après avoir posé `activeId` à la place de `overId`, renuméroté
 * en ordre simple (colonne 0, rang 0…n) ; `null` s'il n'y a rien à faire.
 */
export function moveCategory(
  cats: readonly WorldCatalogCategory[],
  activeId: string,
  overId: string,
): WorldCatalogCategory[] | null {
  const ordered = boardOrder(cats);
  const from = ordered.findIndex(c => c.id === activeId);
  const to = ordered.findIndex(c => c.id === overId);
  if (from < 0 || to < 0 || from === to) return null;
  const next = [...ordered];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((c, i) => ({ ...c, column_index: 0, sort_index: i }));
}

/** La place d'une catégorie créée : au bout du tableau. */
export function appendPosition(cats: readonly WorldCatalogCategory[]): { column_index: number; sort_index: number } {
  const last = boardOrder(cats).at(-1);
  return last ? { column_index: last.column_index, sort_index: last.sort_index + 1 } : { column_index: 0, sort_index: 0 };
}
