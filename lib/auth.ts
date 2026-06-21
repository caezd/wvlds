import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Retourne l'id de l'utilisateur courant **sans aller-retour réseau**.
 *
 * `auth.getUser()` revalide le JWT auprès du serveur Auth de Supabase à chaque
 * appel (latence réseau). Le middleware ayant déjà rafraîchi/validé la session
 * via `getClaims()` (vérification locale de la signature), les pages serveur
 * peuvent récupérer l'id (`sub`) directement depuis les claims du JWT.
 *
 * @returns l'uuid de l'utilisateur, ou `null` s'il n'est pas authentifié.
 */
export async function getUserId(
  supabase: Pick<SupabaseClient, "auth">,
): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  const sub = (data?.claims as { sub?: string } | undefined)?.sub;
  return sub ?? null;
}
