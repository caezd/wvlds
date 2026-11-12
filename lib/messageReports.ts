import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLE } from "@/lib/constants";
import { decryptMessage } from "@/lib/crypto";

/**
 * Signalements de messages (migration 209). Le salon, le monde et l'auteur du
 * message sont déduits côté base ; le client ne fournit que le message et la
 * raison. Les signalements d'un monde se traitent avec « Gérer les salons ».
 */

export const REPORT_REASON_MAX = 500;

export type ReportResult = { ok: true } | { ok: false; reason: "duplicate" | "error"; message?: string };

/** Signale un message. Un seul signalement ouvert par personne et par message. */
export async function reportMessage(
  supabase: Pick<SupabaseClient, "from">,
  messageId: number,
  reason: string,
): Promise<ReportResult> {
  const texte = reason.trim().slice(0, REPORT_REASON_MAX);
  const { error } = await supabase.from(TABLE.MESSAGE_REPORTS).insert({ message_id: messageId, reason: texte });
  if (!error) return { ok: true };
  // 23505 : index unique « un signalement ouvert par personne et par message ».
  if ((error as { code?: string }).code === "23505") return { ok: false, reason: "duplicate" };
  return { ok: false, reason: "error", message: error.message };
}

export type OpenReport = {
  id: string;
  message_id: number | null;
  chat_id: string;
  reason: string;
  created_at: string;
  reporter: { username: string | null } | null;
  message_author: { username: string | null } | null;
  chat: { title: string | null; name: string | null } | null;
  /** Contenu du message signalé, déchiffré ; null s'il a disparu. */
  content: string | null;
  persona_name: string | null;
};

type ReportRow = Omit<OpenReport, "content" | "persona_name"> & {
  message: { content: string | null; persona: { name: string | null } | null } | null;
};

/** Signalements ouverts d'un monde, du plus récent au plus ancien. */
export async function fetchOpenReports(
  supabase: Pick<SupabaseClient, "from">,
  worldId: string,
): Promise<OpenReport[]> {
  const { data, error } = await supabase
    .from(TABLE.MESSAGE_REPORTS)
    .select(
      "id, message_id, chat_id, reason, created_at, reporter:reporter_id(username), message_author:message_author_id(username), chat:chat_id(title, name), message:message_id(content, persona:personas(name))",
    )
    .eq("world_id", worldId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  const rows = data as unknown as ReportRow[];

  // Les messages des salons chiffrés se déchiffrent avec la clé de leur salon.
  const chatIds = [...new Set(rows.filter((r) => r.message?.content?.startsWith("enc:")).map((r) => r.chat_id))];
  const keys = new Map<string, string>();
  if (chatIds.length) {
    const { data: keyRows } = await supabase.from(TABLE.CHATROOM_KEYS).select("chatroom_id, key_b64").in("chatroom_id", chatIds);
    for (const k of (keyRows ?? []) as { chatroom_id: string; key_b64: string }[]) keys.set(k.chatroom_id, k.key_b64);
  }

  return Promise.all(
    rows.map(async ({ message, ...r }) => {
      const key = keys.get(r.chat_id);
      const brut = message?.content ?? null;
      return {
        ...r,
        content: brut === null ? null : key ? await decryptMessage(brut, key) : brut,
        persona_name: message?.persona?.name ?? null,
      };
    }),
  );
}

/** Classe un signalement, ou supprime le message signalé (cf. resolve_message_report). */
export async function resolveReport(
  supabase: Pick<SupabaseClient, "rpc">,
  reportId: string,
  action: "dismiss" | "delete",
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.rpc("resolve_message_report", { p_report_id: reportId, p_action: action });
  return error ? { ok: false, message: error.message } : { ok: true };
}
