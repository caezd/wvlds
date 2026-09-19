import type { SupabaseClient } from "@supabase/supabase-js";

import { RPC, TABLE } from "@/lib/constants";
import { extractMentionTargets, type MentionRole } from "@/lib/mentions";

/**
 * Prévient les personnes mentionnées dans un message, après son envoi ou sa
 * modification.
 *
 * Côté client, parce que le contenu peut être chiffré : seul l'expéditeur
 * connaît le texte en clair. Les `@pseudo` s'écrivent directement dans
 * `notifications` (policy `type = 'mention'`) ; les rôles, `@tous` et `@ici`
 * passent par `notify_group_mentions`, qui vérifie l'auteur et ses
 * permissions. Le message est déjà publié : un échec ici se journalise, il
 * ne remet pas l'envoi en cause.
 */
export async function notifyMentions(
  supabase: SupabaseClient,
  args: {
    text: string;
    messageId: number;
    chatId: string;
    worldId: string;
    selfId: string;
    selfUsername: string | null;
    roles: readonly MentionRole[];
    /** Membres du monde présents, pour `@ici` (canal de présence). */
    onlineMemberIds?: readonly string[];
  },
): Promise<void> {
  const targets = extractMentionTargets(args.text, args.roles);
  const hasGroup = targets.roleIds.length > 0 || targets.everyone || targets.here;
  if (targets.usernames.length === 0 && !hasGroup) return;

  if (targets.usernames.length > 0) {
    const [{ data: mentionedProfiles }, { data: chatroomData }] = await Promise.all([
      supabase.from(TABLE.PROFILES).select("id").in("username", targets.usernames),
      supabase.from(TABLE.CHATROOMS).select("title, name").eq("id", args.chatId).single(),
    ]);
    const room = chatroomData as { title?: string | null; name?: string | null } | null;
    const chatroomTitle = room?.title ?? room?.name ?? null;
    const recipientIds = ((mentionedProfiles ?? []) as { id: string }[])
      .map((p) => p.id)
      .filter((id) => id !== args.selfId);
    if (recipientIds.length > 0) {
      const { data: members } = await supabase
        .from(TABLE.WORLD_MEMBERS)
        .select("user_id")
        .eq("world_id", args.worldId)
        .in("user_id", recipientIds);
      const validIds = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id);
      if (validIds.length > 0) {
        const { error } = await supabase.from(TABLE.NOTIFICATIONS).insert(
          validIds.map((rid) => ({
            recipient_id: rid,
            type: "mention",
            world_id: args.worldId,
            chat_id: args.chatId,
            message_id: args.messageId,
            actor_id: args.selfId,
            actor_name: args.selfUsername,
            content: chatroomTitle,
          })),
        );
        if (error) console.error("[mentions] notifications non créées", error.message);
      }
    }
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
