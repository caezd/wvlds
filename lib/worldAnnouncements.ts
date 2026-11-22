import type { SupabaseClient } from "@supabase/supabase-js";
import { RPC, TABLE } from "@/lib/constants";

/**
 * Annonces d'un monde (migration 227) : écrire à tous les membres, ou aux
 * porteurs de certains rôles, par message privé ou par notification. La base
 * fait foi (permission `members.announce`, plafond de 10 envois par jour,
 * blocages) ; ce module ne fait qu'appeler ses RPC et nommer ses refus.
 */

export type AnnouncementKind = "message" | "notification";

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 4000;
/** Miroir du plafond de `send_world_announcement`. */
export const ANNOUNCEMENT_DAILY_LIMIT = 10;

/** Variables remplacées pour chaque destinataire, côté base. */
export const ANNOUNCEMENT_VARIABLES = ["username", "world"] as const;
export type AnnouncementVariable = (typeof ANNOUNCEMENT_VARIABLES)[number];

/** Remplace `{username}` et `{world}`, comme la base le fait à l'envoi. */
export function renderAnnouncement(text: string, values: Record<AnnouncementVariable, string>): string {
  return text.replaceAll("{username}", values.username).replaceAll("{world}", values.world);
}

export type SendAnnouncementInput = {
  worldId: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  /** Vide : tous les membres. */
  roleIds: string[];
};

export type AnnouncementErrorReason = "rate_limit" | "test_rate_limit" | "invalid" | "dms_disabled" | "forbidden" | "error";

export type SendAnnouncementResult =
  | { ok: true; recipients: number }
  | { ok: false; reason: AnnouncementErrorReason };

/** Traduit une erreur de la RPC en raison connue de l'interface. */
export function announcementErrorReason(error: { message?: string; code?: string }): AnnouncementErrorReason {
  const msg = error.message ?? "";
  if (msg.includes("announcement_test_rate_limit")) return "test_rate_limit";
  if (msg.includes("announcement_rate_limit")) return "rate_limit";
  if (msg.includes("announcement_dms_disabled")) return "dms_disabled";
  if (msg.includes("announcement_invalid")) return "invalid";
  if (error.code === "42501") return "forbidden";
  return "error";
}

export async function sendWorldAnnouncement(
  supabase: Pick<SupabaseClient, "rpc">,
  input: SendAnnouncementInput,
): Promise<SendAnnouncementResult> {
  const { data, error } = await supabase.rpc(RPC.SEND_WORLD_ANNOUNCEMENT, {
    p_world_id: input.worldId,
    p_kind: input.kind,
    p_title: input.kind === "notification" ? input.title.trim() : null,
    p_body: input.body.trim(),
    p_role_ids: input.roleIds,
  });
  if (error) {
    console.error("[worldAnnouncements] envoi", error);
    return { ok: false, reason: announcementErrorReason(error) };
  }
  const recipients = typeof (data as { recipients?: unknown } | null)?.recipients === "number"
    ? (data as { recipients: number }).recipients
    : 0;
  return { ok: true, recipients };
}

/** Plafond des essais de `send_world_announcement_test`, par personne et par heure. */
export const ANNOUNCEMENT_TEST_HOURLY_LIMIT = 10;

/**
 * S'envoyer l'annonce à soi-même (migration 228). Toujours en notification :
 * un message privé ne peut pas s'adresser à son propre compte. Hors plafond
 * du monde et hors historique.
 */
export async function sendAnnouncementTest(
  supabase: Pick<SupabaseClient, "rpc">,
  input: Omit<SendAnnouncementInput, "roleIds">,
): Promise<{ ok: true } | { ok: false; reason: AnnouncementErrorReason }> {
  const { error } = await supabase.rpc(RPC.SEND_WORLD_ANNOUNCEMENT_TEST, {
    p_world_id: input.worldId,
    p_kind: input.kind,
    p_title: input.kind === "notification" ? input.title.trim() : null,
    p_body: input.body.trim(),
  });
  if (error) {
    console.error("[worldAnnouncements] essai", error);
    return { ok: false, reason: announcementErrorReason(error) };
  }
  return { ok: true };
}

/**
 * Lectures par annonce (migration 228) : notification lue, ou conversation
 * ouverte depuis l'envoi. Une annonce absente de la table n'a pas de suivi.
 */
export async function fetchAnnouncementReadCounts(
  supabase: Pick<SupabaseClient, "rpc">,
  worldId: string,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc(RPC.WORLD_ANNOUNCEMENT_READ_COUNTS, { p_world_id: worldId, p_ids: ids });
  if (error || !Array.isArray(data)) return new Map();
  return new Map(
    (data as { announcement_id: string; read_count: number }[]).map((r) => [r.announcement_id, r.read_count]),
  );
}

/** Nombre de destinataires ; `null` si la base refuse ou échoue. */
export async function countAnnouncementRecipients(
  supabase: Pick<SupabaseClient, "rpc">,
  worldId: string,
  kind: AnnouncementKind,
  roleIds: string[],
): Promise<number | null> {
  const { data, error } = await supabase.rpc(RPC.COUNT_WORLD_ANNOUNCEMENT_RECIPIENTS, {
    p_world_id: worldId,
    p_kind: kind,
    p_role_ids: roleIds,
  });
  if (error || typeof data !== "number") return null;
  return data;
}

export type WorldAnnouncement = {
  id: string;
  kind: AnnouncementKind;
  title: string | null;
  body: string;
  role_ids: string[];
  recipient_count: number;
  created_at: string;
  author: { username: string | null } | null;
};

/** Les dernières annonces du monde, de la plus récente à la plus ancienne. */
export async function fetchWorldAnnouncements(
  supabase: Pick<SupabaseClient, "from">,
  worldId: string,
  limit = 20,
): Promise<WorldAnnouncement[]> {
  const { data, error } = await supabase
    .from(TABLE.WORLD_ANNOUNCEMENTS)
    .select("id, kind, title, body, role_ids, recipient_count, created_at, author:author_id(username)")
    .eq("world_id", worldId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as WorldAnnouncement[];
}
