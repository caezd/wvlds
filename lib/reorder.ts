// ──────────────────────────────────────────────────────────────────────────
// Réordonner une liste en une requête (migrations 162 et 224).
//
// Chaque fonction `reorder_*` applique toute la liste en une transaction et
// rend le nombre de lignes touchées. Une RLS qui refuse ne lève pas d'erreur :
// elle ne touche rien. Le compte est donc comparé à ce qui a été envoyé — un
// écart est un refus, et l'appelant doit rétablir l'ordre affiché.
// ──────────────────────────────────────────────────────────────────────────

export type ReorderFn =
  | "reorder_world_maps"
  | "reorder_world_wiki_pages"
  | "reorder_chatroom_categories"
  | "reorder_persona_sections"
  | "reorder_wiki_note_categories"
  | "reorder_wiki_notes";

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Message d'un refus silencieux (aucune ligne, ou pas toutes, touchée). */
export const REORDER_REFUSED = "Réordonnancement refusé";

export async function reorderRows(
  supabase: RpcClient,
  fn: ReorderFn,
  items: Record<string, unknown>[],
): Promise<{ error: string | null }> {
  if (items.length === 0) return { error: null };
  const { data, error } = await supabase.rpc(fn, { p_items: items });
  if (error) return { error: error.message };
  if (data !== items.length) return { error: REORDER_REFUSED };
  return { error: null };
}
