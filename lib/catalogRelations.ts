/**
 * Relations entre objets du catalogue (migration 187) : les prérequis d'une
 * compétence, la composition d'un objet. Des arêtes `from → to` d'un même
 * genre, que la base garantit sans boucle ; ce module les lit pour
 * l'interface — listes, arbre de recette, prérequis manquants sur une fiche.
 */

export type CatalogRelationKind = "prerequisite" | "ingredient";

export type CatalogRelation = {
  from_id: string;
  to_id: string;
  kind: CatalogRelationKind;
  /** Toujours 1 pour un prérequis. */
  quantity: number;
  sort_index?: number;
};

const bySort = (a: CatalogRelation, b: CatalogRelation) => (a.sort_index ?? 0) - (b.sort_index ?? 0);

/** Les arêtes qui partent d'un objet : ses prérequis, ses ingrédients. */
export function relationsFrom(id: string, relations: readonly CatalogRelation[], kind: CatalogRelationKind): CatalogRelation[] {
  return relations.filter((r) => r.kind === kind && r.from_id === id).sort(bySort);
}

/** Les arêtes qui arrivent sur un objet : ce qu'il débloque, ce qu'il sert à fabriquer. */
export function relationsTo(id: string, relations: readonly CatalogRelation[], kind: CatalogRelationKind): CatalogRelation[] {
  return relations.filter((r) => r.kind === kind && r.to_id === id).sort(bySort);
}

/**
 * Les prérequis directs d'une compétence que la fiche n'a pas encore.
 *
 * Directs seulement : si « Maître forgeron » exige « Forge avancée » qui
 * exige « Forge », posséder « Forge avancée » suffit — on ne peut l'avoir
 * acquise sans « Forge », la règle s'est appliquée à ce moment-là.
 */
export function missingPrerequisites(
  skillId: string,
  ownedIds: ReadonlySet<string>,
  relations: readonly CatalogRelation[],
): string[] {
  return relationsFrom(skillId, relations, "prerequisite")
    .map((r) => r.to_id)
    .filter((id) => !ownedIds.has(id));
}

export type RecipeNode = {
  id: string;
  /** Quantité demandée par le parent ; 1 à la racine. */
  quantity: number;
  children: RecipeNode[];
  /** L'arbre s'arrête là : profondeur atteinte, ou objet déjà déplié plus haut. */
  truncated?: boolean;
};

/**
 * L'arbre de composition d'un objet, récursif. La base refuse les boucles,
 * mais une profondeur bornée et la mémoire du chemin gardent l'interface
 * sereine face à des données qui auraient été écrites autrement.
 */
export function recipeTree(productId: string, relations: readonly CatalogRelation[], maxDepth = 6): RecipeNode {
  const build = (id: string, quantity: number, depth: number, path: ReadonlySet<string>): RecipeNode => {
    const ingredients = relationsFrom(id, relations, "ingredient");
    if (ingredients.length === 0) return { id, quantity, children: [] };
    if (depth >= maxDepth || path.has(id)) return { id, quantity, children: [], truncated: true };
    const next = new Set(path).add(id);
    return { id, quantity, children: ingredients.map((r) => build(r.to_id, r.quantity, depth + 1, next)) };
  };
  return build(productId, 1, 0, new Set());
}

/** Les quantités totales de matières premières — les feuilles de l'arbre — pour un exemplaire. */
export function recipeLeafTotals(tree: RecipeNode): Map<string, number> {
  const totals = new Map<string, number>();
  const walk = (node: RecipeNode, multiplier: number) => {
    if (node.children.length === 0) {
      totals.set(node.id, (totals.get(node.id) ?? 0) + node.quantity * multiplier);
      return;
    }
    for (const child of node.children) walk(child, multiplier * node.quantity);
  };
  for (const child of tree.children) walk(child, 1);
  return totals;
}
