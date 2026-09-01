import type { SupabaseClient } from "@supabase/supabase-js";

import { BUG_REPORT_BUCKET } from "./bugReports";

/**
 * Durée de validité d'une URL signée.
 *
 * Assez pour consulter la page, pas assez pour qu'un lien copié par mégarde
 * dans un salon ou un ticket reste ouvert. Les pages qui affichent ces images
 * sont rendues côté serveur : chaque visite resigne.
 */
const SIGNATURE_TTL_SECONDS = 10 * 60;

/**
 * Signe les pièces jointes d'un rapport, pour affichage.
 *
 * Le bucket est privé : sans signature, aucune de ces images n'est lisible.
 * La signature est demandée AVEC LA SESSION de l'appelant, donc soumise à la
 * policy de lecture du bucket — un utilisateur ne peut signer que son propre
 * dépôt, un administrateur peut signer tout. Ce n'est pas un contournement de
 * la RLS, c'est elle qui décide.
 *
 * Rend une correspondance chemin → URL. Un chemin absent de la réponse est un
 * chemin que l'appelant n'avait pas le droit de lire, ou qui n'existe plus :
 * l'affichage saute simplement l'image plutôt que de montrer un cadre cassé.
 */
export async function signBugReportAttachments(
  supabase: SupabaseClient,
  paths: readonly string[],
): Promise<Map<string, string>> {
  const signées = new Map<string, string>();
  if (paths.length === 0) return signées;

  const { data } = await supabase.storage
    .from(BUG_REPORT_BUCKET)
    .createSignedUrls([...paths], SIGNATURE_TTL_SECONDS);

  for (const entrée of data ?? []) {
    if (entrée.signedUrl && entrée.path) signées.set(entrée.path, entrée.signedUrl);
  }
  return signées;
}
