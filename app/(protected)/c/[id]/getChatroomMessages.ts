import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { TABLE, CHAT_MESSAGES_PAGE_SIZE } from "@/lib/constants";
import type { Persona } from "@/types/db";

export type ReactionRow = { message_id: number; emoji: string; user_id: string };
export type VoteRow = { message_id: number; option_id: string; user_id: string };
export type ChallengeBadgeEntry = [number, { title: string; description: string | null }];

type ChallengeRef = { title: string; description: string | null } | null;

/** Colonnes d'un message, telles que la vue les attend. */
const MESSAGE_COLUMNS =
  "id, chat_id, content, author_id, created_at, metadata, visible_to, persona:personas(id, user_id, name, avatar_url, narrative_status, is_npc, frame:avatar_frame_id(asset_url)), author:profiles(avatar_url, username)";

/**
 * Réactions, votes et badges « défi remporté » joints aux messages dans la
 * MÊME requête (clés étrangères `message_id → chat_messages.id`). Ils étaient
 * chargés dans une seconde vague, faute de connaître les ids des messages
 * avant d'avoir reçu ceux-ci : un aller-retour réseau de plus par page.
 * Les policies RLS des tables jointes s'appliquent comme pour une requête
 * directe.
 */
const EMBEDDED_COLUMNS = `${MESSAGE_COLUMNS}, chat_message_reactions(emoji, user_id), chat_choice_votes(option_id, user_id), challenge_attempts(status, challenge:challenge_id(title, description))`;

type RawMessage = {
  id: number;
  content?: string | null;
  [key: string]: unknown;
};

type EmbeddedMessage = RawMessage & {
  chat_message_reactions?: { emoji: string; user_id: string }[] | null;
  chat_choice_votes?: { option_id: string; user_id: string }[] | null;
  challenge_attempts?: { status: string; challenge: ChallengeRef }[] | null;
};

export type ChatroomMessagesData = {
  /** Messages en ordre CROISSANT, sans les tableaux joints. */
  messages: RawMessage[];
  hasMore: boolean;
  reactionRows: ReactionRow[];
  voteRows: VoteRow[];
  challengeBadges: ChallengeBadgeEntry[];
  chatroomKey: string | null;
  initialPersona: Persona | null;
};

/**
 * Tout ce qui, pour ouvrir un salon, ne dépend QUE de son id et de
 * l'utilisateur : derniers messages (avec réactions, votes, badges), clé de
 * chiffrement, persona préférée.
 *
 * Mémoïsée pour la requête (React `cache()`) : `page.tsx` la DÉMARRE en même
 * temps que la lecture du salon (`getChatroomWithWorld`), sans l'attendre, et
 * `ChatRoomContent` récupère la même promesse. Ces lectures ne patientent donc
 * plus derrière celle du salon — avant, il fallait trois vagues successives
 * (salon → messages → réactions/votes/nav…) ; il n'en reste que deux, la
 * seconde (nav, rôles… qui ont besoin du `world_id`) se chevauchant avec
 * celle-ci.
 */
export const getChatroomMessages = cache(
  async (chatId: string, userId: string): Promise<ChatroomMessagesData> => {
    const supabase = await createClient();

    const messagesQuery = (columns: string) =>
      supabase
        .from(TABLE.CHAT_MESSAGES)
        .select(columns)
        .eq("chat_id", chatId)
        .order("created_at", { ascending: false })
        .limit(CHAT_MESSAGES_PAGE_SIZE);

    const [{ data: embedded, error: embedError }, { data: keyRow }, { data: pref }] = await Promise.all([
      messagesQuery(EMBEDDED_COLUMNS),
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

    const chatroomKey = (keyRow as { key_b64?: string } | null)?.key_b64 ?? null;
    const initialPersona = ((pref as { persona?: unknown } | null)?.persona as Persona | null) ?? null;

    if (!embedError) {
      const rows = ((embedded ?? []) as unknown as EmbeddedMessage[]).slice().reverse();
      const reactionRows: ReactionRow[] = [];
      const voteRows: VoteRow[] = [];
      const challengeBadges: ChallengeBadgeEntry[] = [];
      const messages = rows.map(({ chat_message_reactions, chat_choice_votes, challenge_attempts, ...m }) => {
        for (const r of chat_message_reactions ?? []) reactionRows.push({ message_id: m.id, emoji: r.emoji, user_id: r.user_id });
        for (const v of chat_choice_votes ?? []) voteRows.push({ message_id: m.id, option_id: v.option_id, user_id: v.user_id });
        const won = (challenge_attempts ?? []).find((a) => a.status === "won" && a.challenge);
        if (won?.challenge) challengeBadges.push([Number(m.id), won.challenge]);
        return m;
      });
      return {
        messages,
        hasMore: rows.length === CHAT_MESSAGES_PAGE_SIZE,
        reactionRows,
        voteRows,
        challengeBadges,
        chatroomKey,
        initialPersona,
      };
    }

    // Repli : la jointure a été refusée (relation absente du cache de schéma
    // PostgREST, par exemple). On revient au chargement en deux temps d'avant
    // plutôt que d'ouvrir un salon vide.
    console.error("[getChatroomMessages] jointure refusée pour %s : %s", chatId, embedError.message);
    const { data: plain } = await messagesQuery(MESSAGE_COLUMNS);
    const messages = ((plain ?? []) as unknown as RawMessage[]).slice().reverse();
    const ids = messages.map((m) => m.id);
    if (!ids.length) {
      return { messages, hasMore: false, reactionRows: [], voteRows: [], challengeBadges: [], chatroomKey, initialPersona };
    }
    const [{ data: reactions }, { data: votes }, { data: attempts }] = await Promise.all([
      supabase.from("chat_message_reactions").select("message_id, emoji, user_id").eq("chat_id", chatId).in("message_id", ids),
      supabase.from(TABLE.CHAT_CHOICE_VOTES).select("message_id, option_id, user_id").eq("chat_id", chatId).in("message_id", ids),
      supabase
        .from(TABLE.CHALLENGE_ATTEMPTS)
        .select("message_id, challenge:challenge_id(title, description)")
        .in("message_id", ids)
        .eq("status", "won"),
    ]);
    return {
      messages,
      hasMore: messages.length === CHAT_MESSAGES_PAGE_SIZE,
      reactionRows: (reactions ?? []) as ReactionRow[],
      voteRows: (votes ?? []) as VoteRow[],
      challengeBadges: ((attempts ?? []) as unknown as { message_id: number; challenge: ChallengeRef }[])
        .filter((r) => r.challenge)
        .map((r) => [Number(r.message_id), r.challenge!]),
      chatroomKey,
      initialPersona,
    };
  },
);
