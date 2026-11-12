import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLE } from "@/lib/constants";

/**
 * L'utilisateur est-il toujours membre du monde (ou son propriétaire) ?
 *
 * Rend `null` quand la réponse est incertaine (erreur réseau, lecture
 * refusée) : l'appelant ne doit alors RIEN conclure — renvoyer quelqu'un hors
 * d'un monde sur une coupure passagère serait pire que le mal.
 */
export async function isStillWorldMember(
  supabase: Pick<SupabaseClient, "from">,
  worldId: string,
  userId: string,
): Promise<boolean | null> {
  const { data: ligne, error } = await supabase
    .from(TABLE.WORLD_MEMBERS)
    .select("user_id")
    .eq("world_id", worldId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  if (ligne) return true;

  // Pas de ligne de membre : le propriétaire reste chez lui.
  const { data: monde, error: errMonde } = await supabase
    .from(TABLE.WORLDS)
    .select("owner_id")
    .eq("id", worldId)
    .maybeSingle();
  if (errMonde) return null;
  // Monde illisible (plus membre → la policy le masque) ou propriétaire autre.
  return (monde as { owner_id?: string } | null)?.owner_id === userId;
}
