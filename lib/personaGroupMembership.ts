import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSONA_ASSIGNMENT_COLUMNS, type PersonaGroupAssignment } from "@/lib/personaGroups";

/**
 * Les écritures de l'appartenance d'un persona à ses groupes (migration 242),
 * partagées par les Relations et l'onglet Groupes des réglages.
 *
 * La base tient seule le groupe principal : le premier groupe rejoint le
 * devient, en désigner un autre retire ce rang à l'ancien, quitter son groupe
 * principal fait monter le suivant. Après une écriture, l'écran relit donc les
 * affectations (`fetchGroupAssignments`) plutôt que de refaire ces règles.
 *
 * Chaque fonction renvoie `true` si l'écriture a réussi.
 */

const TABLE = "persona_group_assignments";

/** Ajoute des personas à un groupe ; ceux qui en sont déjà membres sont ignorés. */
export async function addPersonasToGroup(
  supabase: SupabaseClient,
  worldId: string,
  groupId: string,
  personaIds: readonly string[],
): Promise<boolean> {
  const ids = [...new Set(personaIds)];
  if (ids.length === 0) return true;
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      ids.map((persona_id) => ({ persona_id, world_id: worldId, group_id: groupId })),
      { onConflict: "persona_id,group_id", ignoreDuplicates: true },
    );
  return !error;
}

/** Retire un persona d'un groupe, sans toucher à ses autres groupes. */
export async function removePersonaFromGroup(
  supabase: SupabaseClient,
  personaId: string,
  groupId: string,
): Promise<boolean> {
  const { error } = await supabase.from(TABLE).delete().eq("persona_id", personaId).eq("group_id", groupId);
  return !error;
}

/** Fait d'un des groupes du persona son groupe principal. */
export async function setPrimaryGroup(
  supabase: SupabaseClient,
  personaId: string,
  groupId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ is_primary: true })
    .eq("persona_id", personaId)
    .eq("group_id", groupId)
    .select("group_id");
  // La RLS ne lève pas d'erreur : elle ne touche aucune ligne.
  return !error && Array.isArray(data) && data.length > 0;
}

/** Les affectations d'un monde ; `null` si la lecture échoue. */
export async function fetchGroupAssignments(
  supabase: SupabaseClient,
  worldId: string,
): Promise<PersonaGroupAssignment[] | null> {
  const { data, error } = await supabase.from(TABLE).select(PERSONA_ASSIGNMENT_COLUMNS).eq("world_id", worldId);
  return error ? null : ((data ?? []) as PersonaGroupAssignment[]);
}
