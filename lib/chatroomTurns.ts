import type { SupabaseClient } from "@supabase/supabase-js";
import { RPC, TABLE } from "@/lib/constants";

/**
 * Ordre de passage d'un salon (migrations 211 et 280). Une ligne par salon ;
 * le tour avance en base quand le joueur courant poste un message public
 * (mode « message ») ou quand il passe la main (mode « manual », ou dans les
 * deux modes par `passTurn`). Réglé par le créateur du salon ou qui a
 * « Gérer les salons » (policies).
 */
export const TURN_ADVANCE_MODES = ["message", "manual"] as const;
export type TurnAdvanceMode = (typeof TURN_ADVANCE_MODES)[number];

export type ChatroomTurn = {
  chat_id: string;
  enabled: boolean;
  /** Absent des lignes d'avant la migration 280 : « message ». */
  advance_mode?: TurnAdvanceMode;
  /** Début du tour du joueur courant, tenu par la base (migration 280). */
  turn_started_at?: string;
  /** Joueurs (comptes) dans l'ordre de passage. */
  order_user_ids: string[];
  /** Index (0-based) du joueur dont c'est le tour. */
  current_index: number;
};

const COLUMNS = "chat_id, enabled, advance_mode, order_user_ids, current_index, turn_started_at";

/** Comment le tour passe au suivant. */
export function turnAdvanceMode(turn: ChatroomTurn | null | undefined): TurnAdvanceMode {
  return turn?.advance_mode === "manual" ? "manual" : "message";
}

/** L'ordre est-il en vigueur (activé, au moins un joueur) ? */
export function isTurnActive(turn: ChatroomTurn | null | undefined): turn is ChatroomTurn {
  return !!turn && turn.enabled && turn.order_user_ids.length > 0;
}

/** Joueur dont c'est le tour, ou null hors ordre actif. */
export function currentPlayerId(turn: ChatroomTurn | null | undefined): string | null {
  if (!isTurnActive(turn)) return null;
  return turn.order_user_ids[turn.current_index % turn.order_user_ids.length] ?? null;
}

/** Les `n` joueurs suivants, dans l'ordre, sans le joueur courant. */
export function upcomingPlayerIds(turn: ChatroomTurn | null | undefined, n = 2): string[] {
  if (!isTurnActive(turn)) return [];
  const list = turn.order_user_ids;
  const out: string[] = [];
  for (let k = 1; k <= Math.min(n, list.length - 1); k++) {
    out.push(list[(turn.current_index + k) % list.length]);
  }
  return out;
}

/** Déplace l'élément d'index `index` de `delta` cases (bornées), sans muter. */
export function moveInOrder<T>(list: readonly T[], index: number, delta: number): T[] {
  const target = Math.max(0, Math.min(list.length - 1, index + delta));
  if (target === index || index < 0 || index >= list.length) return [...list];
  const out = [...list];
  const [item] = out.splice(index, 1);
  out.splice(target, 0, item);
  return out;
}

export async function fetchTurn(supabase: Pick<SupabaseClient, "from">, chatId: string): Promise<ChatroomTurn | null> {
  const { data } = await supabase.from(TABLE.CHATROOM_TURNS).select(COLUMNS).eq("chat_id", chatId).maybeSingle();
  return (data as ChatroomTurn | null) ?? null;
}

/**
 * Joueurs qu'on peut ranger dans l'ordre (migration 279) : invités du salon
 * (personas ou groupes) et auteurs d'au moins un message. Une erreur ne
 * propose personne plutôt que tout le monde.
 */
export async function fetchChatroomPlayerIds(supabase: Pick<SupabaseClient, "rpc">, chatId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc(RPC.LIST_CHATROOM_PLAYER_IDS, { p_chat_id: chatId });
  if (error) {
    console.error("[chatroomTurns] joueurs du salon", error);
    return [];
  }
  return Array.isArray(data) ? data.filter((x): x is string => typeof x === "string") : [];
}

/** Crée ou remplace l'ordre d'un salon ; rend la ligne enregistrée. */
export async function saveTurn(
  supabase: Pick<SupabaseClient, "from">,
  chatId: string,
  value: Pick<ChatroomTurn, "enabled" | "advance_mode" | "order_user_ids" | "current_index">,
): Promise<{ turn: ChatroomTurn | null; error?: string }> {
  const { data, error } = await supabase
    .from(TABLE.CHATROOM_TURNS)
    .upsert({ chat_id: chatId, ...value }, { onConflict: "chat_id" })
    .select(COLUMNS)
    .single();
  return error ? { turn: null, error: error.message } : { turn: data as ChatroomTurn };
}

/** Le joueur dont c'est le tour passe la main au suivant (migration 280). */
export async function passTurn(
  supabase: Pick<SupabaseClient, "rpc">,
  chatId: string,
): Promise<{ turn: ChatroomTurn | null; error?: string }> {
  const { data, error } = await supabase.rpc(RPC.PASS_CHATROOM_TURN, { p_chat_id: chatId });
  return error ? { turn: null, error: error.message } : { turn: (data as ChatroomTurn | null) ?? null };
}

/** Passe au joueur suivant (la base ramène l'index dans les bornes). */
export async function skipTurn(
  supabase: Pick<SupabaseClient, "from">,
  turn: ChatroomTurn,
): Promise<{ turn: ChatroomTurn | null; error?: string }> {
  const { data, error } = await supabase
    .from(TABLE.CHATROOM_TURNS)
    .update({ current_index: turn.current_index + 1 })
    .eq("chat_id", turn.chat_id)
    .select(COLUMNS)
    .single();
  return error ? { turn: null, error: error.message } : { turn: data as ChatroomTurn };
}

/**
 * Retire l'ordre de passage du salon : la ligne est désactivée et vidée plutôt
 * que supprimée — les événements DELETE du temps réel ne se filtrent pas par
 * salon, un UPDATE si.
 */
export async function removeTurn(supabase: Pick<SupabaseClient, "from">, chatId: string): Promise<{ turn: ChatroomTurn | null; error?: string }> {
  const { data, error } = await supabase
    .from(TABLE.CHATROOM_TURNS)
    .update({ enabled: false, order_user_ids: [], current_index: 0 })
    .eq("chat_id", chatId)
    .select(COLUMNS)
    .maybeSingle();
  return error ? { turn: null, error: error.message } : { turn: (data as ChatroomTurn | null) ?? null };
}
