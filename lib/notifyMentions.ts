import type { SupabaseClient } from "@supabase/supabase-js";

import { RPC } from "@/lib/constants";
import { extractMentionTargets, type MentionRole } from "@/lib/mentions";

/**
 * Prévient les personnes mentionnées dans un message, après son envoi ou sa
 * modification.
 *
 * Déclenché côté client, parce que le contenu peut être chiffré : seul
 * l'expéditeur connaît le texte en clair, donc qui il mentionne. Le reste est
 * établi par la base : `notify_user_mentions` (les `@pseudo`) et
 * `notify_group_mentions` (rôles, `@tous`, `@ici`) vérifient l'auteur du
 * message, retiennent les seuls membres qui peuvent le lire et écrivent
 * eux-mêmes expéditeur et salon. Le message est déjà publié : un échec ici se
 * journalise, il ne remet pas l'envoi en cause.
 */
export async function notifyMentions(
  supabase: SupabaseClient,
  args: {
    text: string;
    messageId: number;
    roles: readonly MentionRole[];
    /** Membres du monde présents, pour `@ici` (canal de présence). */
    onlineMemberIds?: readonly string[];
  },
): Promise<void> {
  const targets = extractMentionTargets(args.text, args.roles);
  const hasGroup = targets.roleIds.length > 0 || targets.everyone || targets.here;
  if (targets.usernames.length === 0 && !hasGroup) return;

  if (targets.usernames.length > 0) {
    const { error } = await supabase.rpc(RPC.NOTIFY_USER_MENTIONS, {
      p_message_id: args.messageId,
      p_usernames: targets.usernames,
    });
    if (error) console.error("[mentions] notifications non créées", error.message);
  }

  if (hasGroup) {
    const { error } = await supabase.rpc(RPC.NOTIFY_GROUP_MENTIONS, {
      p_message_id: args.messageId,
      p_role_ids: targets.roleIds,
      p_everyone: targets.everyone,
      p_here_ids: targets.here && !targets.everyone ? [...(args.onlineMemberIds ?? [])] : [],
    });
    if (error) console.error("[mentions] notifications de groupe non créées", error.message);
  }
}
