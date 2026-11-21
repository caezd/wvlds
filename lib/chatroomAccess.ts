// lib/chatroomAccess.ts
// Visibilité d'un salon et ses invités (migration 225).
//
//   open    — tout membre du monde lit et écrit (comportement historique) ;
//   public  — tout membre lit, seuls les invités écrivent ;
//   private — seuls les invités lisent et écrivent.
//
// Le créateur du salon et qui a `chatrooms.manage` gardent toujours la main.
// La base fait foi (`can_read_chatroom`, `can_post_in_chatroom`) ; ce module
// ne sert qu'à l'interface.

import type { SupabaseClient } from "@supabase/supabase-js";
import { RPC, TABLE } from "@/lib/constants";

export const CHATROOM_VISIBILITIES = ["open", "public", "private"] as const;
export type ChatroomVisibility = (typeof CHATROOM_VISIBILITIES)[number];

export function isChatroomVisibility(v: unknown): v is ChatroomVisibility {
  return typeof v === "string" && (CHATROOM_VISIBILITIES as readonly string[]).includes(v);
}

/** Les invités n'ont de sens que si le salon n'est pas ouvert. */
export function visibilityHasInvitees(v: ChatroomVisibility): boolean {
  return v !== "open";
}

export const SYNOPSIS_MAX_LENGTH = 4000;

/** Un invité : un persona, ou un groupe de personas (tous ses membres). */
export type ChatroomInvitee = { kind: "persona" | "group"; id: string };

export function inviteeKey(i: ChatroomInvitee): string {
  return `${i.kind}:${i.id}`;
}

type ParticipantRow = { persona_id: string | null; group_id: string | null };

export function inviteesFromRows(rows: ParticipantRow[]): ChatroomInvitee[] {
  return rows.flatMap((r): ChatroomInvitee[] =>
    r.persona_id ? [{ kind: "persona", id: r.persona_id }] : r.group_id ? [{ kind: "group", id: r.group_id }] : [],
  );
}

export async function fetchChatroomInvitees(
  supabase: SupabaseClient,
  chatroomId: string,
): Promise<ChatroomInvitee[]> {
  const { data, error } = await supabase
    .from(TABLE.CHATROOM_PARTICIPANTS)
    .select("persona_id, group_id")
    .eq("chatroom_id", chatroomId);
  if (error) throw error;
  return inviteesFromRows((data ?? []) as ParticipantRow[]);
}

/**
 * Aligne les invités enregistrés sur `next` : ajoute les nouveaux, retire les
 * absents. Rend `false` si une écriture a échoué ou a été refusée.
 */
export async function saveChatroomInvitees(
  supabase: SupabaseClient,
  chatroomId: string,
  previous: ChatroomInvitee[],
  next: ChatroomInvitee[],
): Promise<boolean> {
  const before = new Set(previous.map(inviteeKey));
  const after = new Set(next.map(inviteeKey));
  const added = next.filter((i) => !before.has(inviteeKey(i)));
  const removed = previous.filter((i) => !after.has(inviteeKey(i)));

  if (added.length > 0) {
    const { error } = await supabase.from(TABLE.CHATROOM_PARTICIPANTS).insert(
      added.map((i) => ({
        chatroom_id: chatroomId,
        persona_id: i.kind === "persona" ? i.id : null,
        group_id: i.kind === "group" ? i.id : null,
      })),
    );
    if (error) {
      console.error("[chatroomAccess] ajout d'invités", error);
      return false;
    }
  }

  for (const kind of ["persona", "group"] as const) {
    const ids = removed.filter((i) => i.kind === kind).map((i) => i.id);
    if (ids.length === 0) continue;
    const { error } = await supabase
      .from(TABLE.CHATROOM_PARTICIPANTS)
      .delete()
      .eq("chatroom_id", chatroomId)
      .in(kind === "persona" ? "persona_id" : "group_id", ids);
    if (error) {
      console.error("[chatroomAccess] retrait d'invités", error);
      return false;
    }
  }
  return true;
}

/** Ce que le composeur peut faire dans un salon (RPC `get_chatroom_post_access`). */
export type ChatroomPostAccess = {
  /** Écrire avec n'importe lequel de ses personas. */
  open: boolean;
  /** Sinon, les seuls personas invités. */
  personaIds: string[];
};

export const OPEN_POST_ACCESS: ChatroomPostAccess = { open: true, personaIds: [] };

export function parsePostAccess(raw: unknown): ChatroomPostAccess {
  if (!raw || typeof raw !== "object") return OPEN_POST_ACCESS;
  const r = raw as { open?: unknown; persona_ids?: unknown };
  if (r.open !== false) return OPEN_POST_ACCESS;
  const ids = Array.isArray(r.persona_ids) ? r.persona_ids.filter((x): x is string => typeof x === "string") : [];
  return { open: false, personaIds: ids };
}

/**
 * Relit ce que l'utilisateur peut écrire dans un salon. Un salon ouvert ne
 * coûte pas d'aller-retour ; une erreur laisse le composeur ouvert, la base
 * refusant de toute façon un message non permis.
 */
export async function fetchPostAccess(
  supabase: SupabaseClient,
  chatroomId: string,
  visibility: ChatroomVisibility,
): Promise<ChatroomPostAccess> {
  if (visibility === "open") return OPEN_POST_ACCESS;
  const { data, error } = await supabase.rpc(RPC.GET_CHATROOM_POST_ACCESS, { p_chat_id: chatroomId });
  if (error) {
    console.error("[chatroomAccess] accès en écriture", error);
    return OPEN_POST_ACCESS;
  }
  return parsePostAccess(data);
}
