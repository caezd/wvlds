import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { TABLE } from "@/lib/constants";
import { fetchMessagePage, type MessagePage } from "@/lib/chatMessagePage";
import type { Persona } from "@/types/db";

export type { ReactionRow, VoteRow, ChallengeBadgeEntry } from "@/lib/chatMessagePage";

export type ChatroomMessagesData = MessagePage & {
  chatroomKey: string | null;
  initialPersona: Persona | null;
};

/**
 * Tout ce qui, pour ouvrir un salon, ne dépend QUE de son id et de
 * l'utilisateur : derniers messages (avec réactions, votes, badges joints, cf.
 * lib/chatMessagePage), clé de chiffrement, persona préférée.
 *
 * Mémoïsée pour la requête (React `cache()`) : `page.tsx` la DÉMARRE en même
 * temps que la lecture du salon (`getChatroomWithWorld`), sans l'attendre, et
 * `ChatRoomContent` récupère la même promesse. Ces lectures ne patientent donc
 * plus derrière celle du salon.
 */
export const getChatroomMessages = cache(
  async (chatId: string, userId: string): Promise<ChatroomMessagesData> => {
    const supabase = await createClient();

    const [page, { data: keyRow }, { data: pref }] = await Promise.all([
      fetchMessagePage(supabase, chatId),
      // Clé de chiffrement (null = chatroom sans clé, messages en clair)
      supabase.from(TABLE.CHATROOM_KEYS).select("key_b64").eq("chatroom_id", chatId).maybeSingle(),
      // Persona par défaut pour cet utilisateur dans cette chatroom (facultatif)
      supabase
        .from("chatroom_persona_prefs")
        .select("persona:personas(id, user_id, name, avatar_url, dialogue_color)")
        .eq("chat_id", chatId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    return {
      ...page,
      chatroomKey: (keyRow as { key_b64?: string } | null)?.key_b64 ?? null,
      initialPersona: ((pref as { persona?: unknown } | null)?.persona as Persona | null) ?? null,
    };
  },
);
