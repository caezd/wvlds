/**
 * Les groupes de personas d'un monde, en arbre (migration 232).
 *
 * Un groupe peut en contenir d'autres, sans limite de profondeur. Il hérite de
 * son parent :
 *   - la couleur, tant qu'il n'en a pas une à lui (`color` à NULL) ;
 *   - l'appartenance : un persona d'un sous-groupe compte dans tous ses
 *     ancêtres (invitations à un salon, filtres).
 *
 * Chaque groupe décide aussi si sa couleur teinte ses personas
 * (`apply_color`) : nom dans les salons, anneau de l'avatar, tuiles, graphe
 * des relations. Sa pastille, elle, reste visible partout où l'on désigne le
 * groupe lui-même (réglages, filtres, invitations).
 *
 * Le calcul se fait ici, en pur, pour que chaque écran lise la même règle que
 * la base (`persona_group_tint`, `persona_group_subtree`).
 */

/** Une ligne de `world_persona_groups`. */
export type PersonaGroupRow = {
  id: string;
  name: string;
  /** NULL : hérite de la couleur de son parent. */
  color: string | null;
  parent_id: string | null;
  sort_index: number;
  /** La couleur teinte-t-elle les personas du groupe ? */
  apply_color: boolean;
};

/** Les colonnes à lire pour `PersonaGroupRow`. */
export const PERSONA_GROUP_COLUMNS = "id, name, color, parent_id, sort_index, apply_color";

/** Un groupe placé dans l'arbre, avec ce qu'il hérite. */
export type ResolvedPersonaGroup = PersonaGroupRow & {
  /** 0 à la racine. */
  depth: number;
  /** Les noms de ses ancêtres puis le sien. */
  path: string[];
  /** Sa couleur, propre ou héritée ; NULL si aucun ancêtre n'en a. */
  swatch: string | null;
  /** La couleur que montrent ses personas, ou `undefined` s'il ne l'applique pas. */
  tint: string | undefined;
};

/** Séparateur d'un chemin de groupes à l'écran. */
export const GROUP_PATH_SEPARATOR = " › ";

/** « Parent › Enfant ». */
export function groupPathLabel(group: Pick<ResolvedPersonaGroup, "path">): string {
  return group.path.join(GROUP_PATH_SEPARATOR);
}

/** Accepte les lignes d'avant la migration 232 (ni parent ni `apply_color`). */
export function normalizeGroupRow(row: Partial<PersonaGroupRow> & { id: string; name: string }): PersonaGroupRow {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? null,
    parent_id: row.parent_id ?? null,
    sort_index: row.sort_index ?? 0,
    apply_color: row.apply_color ?? true,
  };
}

/** Enfants directs, dans l'ordre du monde. */
export function childrenOf<T extends Pick<PersonaGroupRow, "parent_id" | "sort_index">>(
  rows: readonly T[],
  parentId: string | null,
): T[] {
  return rows.filter((g) => g.parent_id === parentId).sort((a, b) => a.sort_index - b.sort_index);
}

/**
 * L'arbre aplati en ordre de lecture : chaque groupe suivi de ses
 * sous-groupes. Un groupe dont le parent manque (supprimé entre deux
 * lectures) ou pris dans une boucle se range à la racine plutôt que de
 * disparaître.
 */
export function resolvePersonaGroups(rows: readonly PersonaGroupRow[]): ResolvedPersonaGroup[] {
  const ids = new Set(rows.map((g) => g.id));
  const out: ResolvedPersonaGroup[] = [];
  const placed = new Set<string>();

  const visit = (g: PersonaGroupRow, depth: number, parentPath: string[], inherited: string | null) => {
    if (placed.has(g.id)) return;
    placed.add(g.id);
    const swatch = g.color ?? inherited;
    const path = [...parentPath, g.name];
    out.push({ ...g, depth, path, swatch, tint: g.apply_color && swatch ? swatch : undefined });
    for (const child of childrenOf(rows, g.id)) visit(child, depth + 1, path, swatch);
  };

  const roots = rows
    .filter((g) => g.parent_id === null || !ids.has(g.parent_id))
    .sort((a, b) => a.sort_index - b.sort_index);
  for (const root of roots) visit(root, 0, [], null);
  // Les restes : une boucle de parenté, que la base interdit.
  for (const g of [...rows].sort((a, b) => a.sort_index - b.sort_index)) visit(g, 0, [], null);
  return out;
}

/** Le groupe et toute sa descendance. */
export function groupSubtreeIds(rows: readonly Pick<PersonaGroupRow, "id" | "parent_id">[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const g of rows) {
      if (g.parent_id === id && !ids.has(g.id)) {
        ids.add(g.id);
        queue.push(g.id);
      }
    }
  }
  return ids;
}

/**
 * Pour chaque groupe, lui-même et ses ancêtres : un persona de ce groupe
 * compte dans chacun d'eux.
 */
export function groupLineages(rows: readonly Pick<PersonaGroupRow, "id" | "parent_id">[]): Map<string, ReadonlySet<string>> {
  const byId = new Map(rows.map((g) => [g.id, g]));
  const out = new Map<string, ReadonlySet<string>>();
  for (const g of rows) {
    const lineage = new Set<string>();
    let current: string | null = g.id;
    while (current !== null && !lineage.has(current)) {
      lineage.add(current);
      current = byId.get(current)?.parent_id ?? null;
    }
    out.set(g.id, lineage);
  }
  return out;
}

/** Un persona affecté à `personaGroupId` est-il membre de `groupId` (directement ou par un sous-groupe) ? */
export function isInGroup(
  lineages: ReadonlyMap<string, ReadonlySet<string>>,
  personaGroupId: string | undefined,
  groupId: string,
): boolean {
  if (!personaGroupId) return false;
  return lineages.get(personaGroupId)?.has(groupId) ?? personaGroupId === groupId;
}

/** La teinte de chaque persona affecté à un groupe qui applique sa couleur. */
export function personaTints(
  groups: readonly ResolvedPersonaGroup[],
  assignments: readonly { persona_id: string; group_id: string }[],
): Record<string, string> {
  const tintOf = new Map(groups.map((g) => [g.id, g.tint]));
  const out: Record<string, string> = {};
  for (const a of assignments) {
    const tint = tintOf.get(a.group_id);
    if (tint) out[a.persona_id] = tint;
  }
  return out;
}

/**
 * Les groupes tels qu'une liste les nomme (filtres, étagères, invitations) :
 * dans l'ordre de l'arbre, sous leur chemin, avec leur pastille.
 */
export function groupChoices(groups: readonly ResolvedPersonaGroup[]): { id: string; name: string; color: string | null }[] {
  return groups.map((g) => ({ id: g.id, name: groupPathLabel(g), color: g.swatch }));
}
