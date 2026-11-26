import { createClient } from "@/lib/supabase/server";
import { parseSharePreview, type SharePreview, type ShareTarget } from "@/lib/sharePreview";

/**
 * Aperçu public du monde (ou du salon) visé par un lien partagé.
 *
 * Lu par `get_world_share_preview` (migration 267), ouverte aux visiteurs sans
 * session : elle ne rend que les champs publics d'un monde public, et NULL
 * pour tout le reste. Une erreur donne l'aperçu générique plutôt qu'une page
 * de connexion en panne.
 */
export async function getSharePreview(target: ShareTarget): Promise<SharePreview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_world_share_preview", {
    p_world_id: target.kind === "world" ? target.id : null,
    p_chatroom_id: target.kind === "chatroom" ? target.id : null,
  });
  if (error) {
    console.error("[sharePreview]", error.message);
    return null;
  }
  return parseSharePreview(data);
}
