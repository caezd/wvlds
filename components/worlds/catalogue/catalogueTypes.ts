import type { WorldInventoryItem, WorldSkill, WorldCatalogCategory } from "@/types/worlds";

/** Les deux catalogues d'un monde partagent toute leur mécanique. */
export type CatalogType = "inventory" | "skills";

/** Objet ou compétence, tel qu'affiché dans une colonne du catalogue. */
export type CatalogItem = (WorldInventoryItem | WorldSkill) & { category_id: string | null };

/** Catégorie fictive des éléments non classés. */
export const UNCAT = "__uncat__";

/** Préfixe des identifiants de colonne, côté glisser-déposer. */
export const COL_PREFIX = "col-";

/**
 * Répartit les catégories en colonnes, triées, en écartant les colonnes vides.
 *
 * Les catégories portent chacune leur numéro de colonne et leur rang. Les
 * colonnes vides disparaissent : sans cela, supprimer la dernière catégorie
 * d'une colonne y laisserait un blanc au milieu de la grille.
 *
 * Fonction pure — voir `__tests__/catalogueTypes.test.ts`.
 */
export function groupByColumn(cats: WorldCatalogCategory[]): WorldCatalogCategory[][] {
  if (cats.length === 0) return [];
  const maxCol = Math.max(...cats.map(c => c.column_index));
  const buckets: WorldCatalogCategory[][] = Array.from({ length: maxCol + 1 }, () => []);
  for (const cat of cats) buckets[cat.column_index]?.push(cat);
  return buckets
    .map(col => [...col].sort((a, b) => a.sort_index - b.sort_index))
    .filter(col => col.length > 0);
}

