import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLE, CHAT_MESSAGES_PAGE_SIZE } from "@/lib/constants";
import { aggregateChoiceVotes } from "@/lib/choiceVotes";
import { decryptMessage } from "@/lib/crypto";
import type { ChoiceVoteSummary, ReactionSummary } from "@/types/db";

/**
 * Chargement d'une page de messages d'un salon, partagé entre le rendu serveur
 * (première page, cf. app/(protected)/c/[id]/getChatroomMessages.ts) et le
 * client (pages plus anciennes, en remontant l'historique).
 *
 * Une seule définition pour les deux : la page « historique » avait divergé
 * de la première — elle ne chargeait pas les votes, si bien qu'un sondage
 * plus ancien que la première page s'affichait à zéro vote.
 */

export type ReactionRow = { message_id: number; emoji: string; user_id: string };
export type VoteRow = { message_id: number; option_id: string; user_id: string };
export type ChallengeBadgeEntry = [number, { title: string; description: string | null }];

type ChallengeRef = { title: string; description: string | null } | null;

/** Colonnes d'un message, telles que la vue les attend. */
export const MESSAGE_COLUMNS =
  "id, chat_id, content, author_id, created_at, metadata, visible_to, persona:personas(id, user_id, name, avatar_url, narrative_status, is_npc, frame:avatar_frame_id(asset_url)), author:profiles(avatar_url, username)";

/**
 * Réactions, votes et badges « défi remporté » joints aux messages dans la
 * MÊME requête (clés étrangères `message_id → chat_messages.id`, présentes en
 * production). Les policies RLS des tables jointes s'appliquent comme pour une
 * requête directe.
 */
export const EMBEDDED_MESSAGE_COLUMNS = `${MESSAGE_COLUMNS}, chat_message_reactions(emoji, user_id), chat_choice_votes(option_id, user_id), challenge_attempts(status, challenge:challenge_id(title, description))`;

export type RawMessage = {
  id: number;
  content?: string | null;
  created_at?: string;
  [key: string]: unknown;
};

type EmbeddedMessage = RawMessage & {
  chat_message_reactions?: { emoji: string; user_id: string }[] | null;
  chat_choice_votes?: { option_id: string; user_id: string }[] | null;
  challenge_attempts?: { status: string; challenge: ChallengeRef }[] | null;
};

export type MessagePage = {
  /** Messages en ordre CROISSANT, sans les tableaux joints. */
  messages: RawMessage[];
  /** Une page pleine laisse supposer un historique plus ancien. */
  hasMore: boolean;
  reactionRows: ReactionRow[];
  voteRows: VoteRow[];
  challengeBadges: ChallengeBadgeEntry[];
};

/** Sépare les tableaux joints des messages (lignes en ordre décroissant). */
export function splitEmbeddedMessages(rowsDesc: unknown[]): MessagePage {
  const rows = (rowsDesc as EmbeddedMessage[]).slice().reverse();
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
  return { messages, hasMore: rows.length === CHAT_MESSAGES_PAGE_SIZE, reactionRows, voteRows, challengeBadges };
}

/**
 * Charge une page de messages : les plus récents, ou ceux antérieurs à
 * `before` (horodatage du plus ancien message affiché).
 *
 * Repli : si PostgREST refuse la jointure (relation absente de son cache de
 * schéma, par exemple), on revient au chargement en deux temps plutôt que
 * d'afficher un salon vide.
 */
export async function fetchMessagePage(
  supabase: Pick<SupabaseClient, "from">,
  chatId: string,
  options: { before?: string } = {},
): Promise<MessagePage> {
  const query = (columns: string) => {
    let q = supabase.from(TABLE.CHAT_MESSAGES).select(columns).eq("chat_id", chatId);
    if (options.before) q = q.lt("created_at", options.before);
    return q.order("created_at", { ascending: false }).limit(CHAT_MESSAGES_PAGE_SIZE);
  };

  const { data: embedded, error: embedError } = await query(EMBEDDED_MESSAGE_COLUMNS);
  if (!embedError) return splitEmbeddedMessages((embedded ?? []) as unknown[]);

  console.error("[fetchMessagePage] jointure refusée pour %s : %s", chatId, embedError.message);
  const { data: plain } = await query(MESSAGE_COLUMNS);
  const rows = (plain ?? []) as unknown as RawMessage[];
  const messages = rows.slice().reverse();
  const hasMore = rows.length === CHAT_MESSAGES_PAGE_SIZE;
  const ids = messages.map((m) => m.id);
  if (!ids.length) return { messages, hasMore, reactionRows: [], voteRows: [], challengeBadges: [] };

  const [{ data: reactions }, { data: votes }, { data: attempts }] = await Promise.all([
    supabase.from(TABLE.CHAT_MESSAGE_REACTIONS).select("message_id, emoji, user_id").eq("chat_id", chatId).in("message_id", ids),
    supabase.from(TABLE.CHAT_CHOICE_VOTES).select("message_id, option_id, user_id").eq("chat_id", chatId).in("message_id", ids),
    supabase
      .from(TABLE.CHALLENGE_ATTEMPTS)
      .select("message_id, challenge:challenge_id(title, description)")
      .in("message_id", ids)
      .eq("status", "won"),
  ]);
  return {
    messages,
    hasMore,
    reactionRows: (reactions ?? []) as ReactionRow[],
    voteRows: (votes ?? []) as VoteRow[],
    challengeBadges: ((attempts ?? []) as unknown as { message_id: number; challenge: ChallengeRef }[])
      .filter((r) => r.challenge)
      .map((r) => [Number(r.message_id), r.challenge!]),
  };
}

/** Réactions agrégées par message (compte par emoji, « moi » inclus), triées. */
export function summarizeReactions(rows: ReactionRow[], userId: string | null): Map<number, ReactionSummary[]> {
  const byMessage = new Map<number, Map<string, { count: number; me: boolean }>>();
  for (const r of rows) {
    const mid = Number(r.message_id);
    let emMap = byMessage.get(mid);
    if (!emMap) byMessage.set(mid, (emMap = new Map()));
    const prev = emMap.get(r.emoji) ?? { count: 0, me: false };
    emMap.set(r.emoji, { count: prev.count + 1, me: prev.me || (!!userId && r.user_id === userId) });
  }
  const out = new Map<number, ReactionSummary[]>();
  for (const [mid, emMap] of byMessage) {
    out.set(
      mid,
      Array.from(emMap.entries())
        .map(([emoji, v]) => ({ emoji, count: v.count, me: v.me }))
        .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji)),
    );
  }
  return out;
}

/** Votes agrégés par message (cf. aggregateChoiceVotes). */
export function summarizeVotes(rows: VoteRow[], userId: string | null): Map<number, ChoiceVoteSummary[]> {
  const byMessage = new Map<number, VoteRow[]>();
  for (const r of rows) {
    const mid = Number(r.message_id);
    const arr = byMessage.get(mid);
    if (arr) arr.push(r);
    else byMessage.set(mid, [r]);
  }
  const out = new Map<number, ChoiceVoteSummary[]>();
  for (const [mid, list] of byMessage) out.set(mid, aggregateChoiceVotes(list, userId));
  return out;
}

/**
 * Messages d'une page prêts pour la vue : contenu déchiffré (si le salon a une
 * clé), réactions et votes agrégés. Partagé entre le rendu serveur et le
 * chargement de l'historique côté client.
 */
export async function decorateMessagePage<T extends RawMessage>(
  messages: T[],
  page: Pick<MessagePage, "reactionRows" | "voteRows">,
  userId: string | null,
  chatroomKey: string | null,
): Promise<(T & { content: string; reactions: ReactionSummary[]; votes: ChoiceVoteSummary[] })[]> {
  const reactions = summarizeReactions(page.reactionRows, userId);
  const votes = summarizeVotes(page.voteRows, userId);
  return Promise.all(
    messages.map(async (m) => ({
      ...m,
      content: chatroomKey ? await decryptMessage(m.content ?? "", chatroomKey) : (m.content ?? ""),
      reactions: reactions.get(Number(m.id)) ?? [],
      votes: votes.get(Number(m.id)) ?? [],
    })),
  );
}
