import type { SupabaseClient } from "@supabase/supabase-js";
import { RPC, TABLE } from "@/lib/constants";

/**
 * Annonces d'un monde (migration 227) : écrire à tous les membres, ou aux
 * porteurs de certains rôles, par message privé ou par notification. La base
 * fait foi (permission `members.announce`, plafond de 10 envois par jour,
 * blocages) ; ce module ne fait qu'appeler ses RPC et nommer ses refus.
 *
 * Migration 228 : essai à soi-même, lectures. Migration 229 : filtres de
 * destinataires, retrait d'une notification, message de bienvenue.
 * Migration 230 : bandeau (« banner »), signature du monde, envois
 * programmés.
 */

export type AnnouncementKind = "message" | "notification" | "banner";
export const ANNOUNCEMENT_KINDS: readonly AnnouncementKind[] = ["message", "notification", "banner"];

/** Durées d'affichage proposées pour un bandeau, en jours (sinon : jusqu'à fermeture). */
export const BANNER_DAY_OPTIONS = [1, 7, 30] as const;
/** Miroir de `schedule_world_announcement` : envois en attente par monde. */
export const ANNOUNCEMENT_SCHEDULE_LIMIT = 20;
/** Miroir de `schedule_world_announcement` : jours d'avance au plus. */
export const ANNOUNCEMENT_SCHEDULE_MAX_DAYS = 90;

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

/**
 * Filtres de destinataires (migration 229), en plus des rôles visés. La base
 * ne garde que ces clés ; les durées vont de 1 à 3650 jours.
 */
export type AnnouncementFilters = {
  /** Sauf les porteurs de ces rôles. */
  exclude_role_ids?: string[];
  /** Arrivés depuis moins de N jours. */
  joined_within_days?: number;
  /** Aucun message dans les salons du monde depuis N jours. */
  inactive_days?: number;
};

/** Les durées proposées par l'interface, en jours. */
export const ANNOUNCEMENT_FILTER_DAYS = [7, 30, 90] as const;

/** Retire les filtres vides, pour comparer et envoyer un objet minimal. */
export function compactFilters(f: AnnouncementFilters): AnnouncementFilters {
  const out: AnnouncementFilters = {};
  if (f.exclude_role_ids?.length) out.exclude_role_ids = [...f.exclude_role_ids].sort();
  if (f.joined_within_days) out.joined_within_days = f.joined_within_days;
  if (f.inactive_days) out.inactive_days = f.inactive_days;
  return out;
}

export function hasFilters(f: AnnouncementFilters | null | undefined): boolean {
  return !!f && Object.keys(compactFilters(f)).length > 0;
}

/**
 * Étiquettes d'annonce (migration 235) — miroir de la contrainte
 * `world_announcements_label_check`.
 */
export const ANNOUNCEMENT_LABELS = ["info", "event", "rules", "maintenance", "important"] as const;
export type AnnouncementLabel = (typeof ANNOUNCEMENT_LABELS)[number];

export function isAnnouncementLabel(v: unknown): v is AnnouncementLabel {
  return typeof v === "string" && (ANNOUNCEMENT_LABELS as readonly string[]).includes(v);
}

/**
 * Options d'une annonce (migration 235), à l'envoi comme après : afficher
 * dans le widget de l'accueil (pour tous les membres), épingler en tête,
 * étiquette, image d'en-tête. Une clé absente n'est pas touchée.
 */
export type AnnouncementExtras = {
  showOnHome?: boolean;
  pinned?: boolean;
  label?: AnnouncementLabel | null;
  imageUrl?: string | null;
};

/** Au format de la base (`p_extras`) ; seules les clés présentes partent. */
export function extrasToRpc(extras: AnnouncementExtras | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!extras) return out;
  if (extras.showOnHome !== undefined) out.show_on_home = extras.showOnHome;
  if (extras.pinned !== undefined) out.pinned = extras.pinned;
  if (extras.label !== undefined) out.label = extras.label;
  if (extras.imageUrl !== undefined) out.image_url = extras.imageUrl;
  return out;
}

/** `p_extras` seulement s'il y a des options : sans elles, l'appel reste celui d'avant. */
function extrasParam(extras: AnnouncementExtras | undefined): { p_extras?: Record<string, unknown> } {
  const x = extrasToRpc(extras);
  return Object.keys(x).length > 0 ? { p_extras: x } : {};
}

export type SendAnnouncementInput = {
  worldId: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  /** Vide : tous les membres. */
  roleIds: string[];
  filters?: AnnouncementFilters;
  /** Notification ou bandeau signés par le monde (migration 230). */
  asWorld?: boolean;
  /** Bandeau : jours d'affichage ; absent, jusqu'à ce qu'on le ferme. */
  bannerDays?: number | null;
  /** Accueil, épingle, étiquette, image (migration 235). */
  extras?: AnnouncementExtras;
};

export type AnnouncementErrorReason =
  | "rate_limit"
  | "test_rate_limit"
  | "schedule_limit"
  | "no_recipients"
  | "invalid"
  | "dms_disabled"
  | "forbidden"
  | "error";

export type SendAnnouncementResult =
  | { ok: true; recipients: number }
  | { ok: false; reason: AnnouncementErrorReason };

/** Traduit une erreur de la RPC en raison connue de l'interface. */
export function announcementErrorReason(error: { message?: string; code?: string }): AnnouncementErrorReason {
  const msg = error.message ?? "";
  if (msg.includes("announcement_test_rate_limit")) return "test_rate_limit";
  if (msg.includes("announcement_schedule_limit")) return "schedule_limit";
  if (msg.includes("announcement_no_recipients")) return "no_recipients";
  if (msg.includes("announcement_rate_limit")) return "rate_limit";
  if (msg.includes("announcement_dms_disabled")) return "dms_disabled";
  if (msg.includes("announcement_invalid")) return "invalid";
  // Un envoi programmé garde le message seul, sans code.
  if (error.code === "42501" || msg.includes("Permission refusée")) return "forbidden";
  return "error";
}

export async function sendWorldAnnouncement(
  supabase: Pick<SupabaseClient, "rpc">,
  input: SendAnnouncementInput,
): Promise<SendAnnouncementResult> {
  const { data, error } = await supabase.rpc(RPC.SEND_WORLD_ANNOUNCEMENT, {
    p_world_id: input.worldId,
    p_kind: input.kind,
    p_title: input.kind !== "message" ? input.title.trim() : null,
    p_body: input.body.trim(),
    p_role_ids: input.roleIds,
    p_filters: compactFilters(input.filters ?? {}),
    p_as_world: input.kind !== "message" && !!input.asWorld,
    p_banner_days: input.kind === "banner" ? (input.bannerDays ?? null) : null,
    ...extrasParam(input.extras),
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
  input: Omit<SendAnnouncementInput, "roleIds" | "filters" | "bannerDays"> & {
    /** Essai du message de bienvenue : notifié comme tel (migration 263). */
    welcome?: boolean;
  },
): Promise<{ ok: true } | { ok: false; reason: AnnouncementErrorReason }> {
  const { error } = await supabase.rpc(RPC.SEND_WORLD_ANNOUNCEMENT_TEST, {
    p_world_id: input.worldId,
    p_kind: input.kind,
    p_title: input.kind !== "message" ? input.title.trim() : null,
    p_body: input.body.trim(),
    p_as_world: input.kind !== "message" && !!input.asWorld,
    p_welcome: !!input.welcome,
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
  filters: AnnouncementFilters = {},
): Promise<number | null> {
  const { data, error } = await supabase.rpc(RPC.COUNT_WORLD_ANNOUNCEMENT_RECIPIENTS, {
    p_world_id: worldId,
    p_kind: kind,
    p_role_ids: roleIds,
    p_filters: compactFilters(filters),
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
  filters: AnnouncementFilters;
  recipient_count: number;
  created_at: string;
  /** Notification retirée des cloches (migration 229), ou bandeau retiré (230). */
  retracted_at: string | null;
  /** Signée par le monde (migration 230). */
  signed_as_world: boolean;
  /** Bandeau : fin d'affichage ; null, jusqu'à fermeture. */
  banner_until: string | null;
  /** Migration 235 : widget de l'accueil, épingle, étiquette, image, modification. */
  show_on_home?: boolean;
  pinned_at?: string | null;
  label?: AnnouncementLabel | null;
  image_url?: string | null;
  edited_at?: string | null;
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
    .select("id, kind, title, body, role_ids, filters, recipient_count, created_at, retracted_at, signed_as_world, banner_until, show_on_home, pinned_at, label, image_url, edited_at, author:author_id(username)")
    .eq("world_id", worldId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as unknown as WorldAnnouncement[];
}

/**
 * Retire une annonce envoyée en notification (migration 229) : les
 * notifications disparaissent des cloches. Les messages privés, eux, restent.
 */
export async function retractWorldAnnouncement(
  supabase: Pick<SupabaseClient, "rpc">,
  announcementId: string,
): Promise<{ ok: true; removed: number } | { ok: false; reason: AnnouncementErrorReason }> {
  const { data, error } = await supabase.rpc(RPC.RETRACT_WORLD_ANNOUNCEMENT, { p_announcement_id: announcementId });
  if (error) {
    console.error("[worldAnnouncements] retrait", error);
    return { ok: false, reason: announcementErrorReason(error) };
  }
  return { ok: true, removed: typeof data === "number" ? data : 0 };
}

/** Le message de bienvenue d'un monde (migration 229). */
export type WorldWelcome = {
  enabled: boolean;
  kind: AnnouncementKind;
  title: string | null;
  body: string;
  sent_count: number;
  updated_at: string;
  /** Notification signée par le monde (migration 230). */
  signed_as_world: boolean;
  /** L'expéditeur : la dernière personne à l'avoir enregistré. */
  author: { username: string | null } | null;
};

export async function fetchWorldWelcome(
  supabase: Pick<SupabaseClient, "from">,
  worldId: string,
): Promise<WorldWelcome | null> {
  const { data, error } = await supabase
    .from(TABLE.WORLD_WELCOME_MESSAGES)
    .select("enabled, kind, title, body, sent_count, updated_at, signed_as_world, author:author_id(username)")
    .eq("world_id", worldId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as WorldWelcome;
}

/** Enregistre le modèle (et l'active), ou le coupe avec `enabled: false`. */
export async function saveWorldWelcome(
  supabase: Pick<SupabaseClient, "rpc">,
  input: { worldId: string; enabled: boolean; kind: AnnouncementKind; title: string; body: string; asWorld?: boolean },
): Promise<{ ok: true } | { ok: false; reason: AnnouncementErrorReason }> {
  const { error } = await supabase.rpc(RPC.SAVE_WORLD_WELCOME, {
    p_world_id: input.worldId,
    p_enabled: input.enabled,
    p_kind: input.kind,
    p_title: input.kind !== "message" ? input.title.trim() : null,
    p_body: input.body.trim(),
    p_as_world: input.kind !== "message" && !!input.asWorld,
  });
  if (error) {
    console.error("[worldAnnouncements] bienvenue", error);
    return { ok: false, reason: announcementErrorReason(error) };
  }
  return { ok: true };
}

/** Un envoi programmé (migration 230). */
export type ScheduledAnnouncement = {
  id: string;
  kind: AnnouncementKind;
  title: string | null;
  body: string;
  role_ids: string[];
  filters: AnnouncementFilters;
  signed_as_world: boolean;
  banner_days: number | null;
  scheduled_for: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  error: string | null;
  author: { username: string | null } | null;
};

/** Les envois en attente, et ceux qui ont échoué, du plus proche au plus lointain. */
export async function fetchScheduledAnnouncements(
  supabase: Pick<SupabaseClient, "from">,
  worldId: string,
): Promise<ScheduledAnnouncement[]> {
  const { data, error } = await supabase
    .from(TABLE.WORLD_SCHEDULED_ANNOUNCEMENTS)
    .select("id, kind, title, body, role_ids, filters, signed_as_world, banner_days, scheduled_for, status, error, author:author_id(username)")
    .eq("world_id", worldId)
    .in("status", ["pending", "failed"])
    .order("scheduled_for", { ascending: true })
    .limit(30);
  if (error || !data) return [];
  return data as unknown as ScheduledAnnouncement[];
}

export async function scheduleWorldAnnouncement(
  supabase: Pick<SupabaseClient, "rpc">,
  input: SendAnnouncementInput & { scheduledFor: Date },
): Promise<{ ok: true; id: string } | { ok: false; reason: AnnouncementErrorReason }> {
  const { data, error } = await supabase.rpc(RPC.SCHEDULE_WORLD_ANNOUNCEMENT, {
    p_world_id: input.worldId,
    p_kind: input.kind,
    p_title: input.kind !== "message" ? input.title.trim() : null,
    p_body: input.body.trim(),
    p_role_ids: input.roleIds,
    p_filters: compactFilters(input.filters ?? {}),
    p_as_world: input.kind !== "message" && !!input.asWorld,
    p_banner_days: input.kind === "banner" ? (input.bannerDays ?? null) : null,
    p_scheduled_for: input.scheduledFor.toISOString(),
    ...extrasParam(input.extras),
  });
  if (error) {
    console.error("[worldAnnouncements] programmation", error);
    return { ok: false, reason: announcementErrorReason(error) };
  }
  return { ok: true, id: String(data) };
}

export async function cancelScheduledAnnouncement(
  supabase: Pick<SupabaseClient, "rpc">,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: AnnouncementErrorReason }> {
  const { error } = await supabase.rpc(RPC.CANCEL_SCHEDULED_WORLD_ANNOUNCEMENT, { p_id: id });
  if (error) {
    console.error("[worldAnnouncements] annulation", error);
    return { ok: false, reason: announcementErrorReason(error) };
  }
  return { ok: true };
}

/** Un bandeau affiché à un membre (variables déjà remplacées par la base). */
export type WorldBanner = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  /** Le monde, ou le pseudo de l'auteur. */
  signer: string | null;
  signed_as_world: boolean;
  /** L'essai de son auteur (migration 233), visible de lui seul. */
  is_test?: boolean;
  /** Migration 235. */
  label?: AnnouncementLabel | null;
  image_url?: string | null;
  edited_at?: string | null;
};

export async function fetchWorldBanners(
  supabase: Pick<SupabaseClient, "rpc">,
  worldId: string,
): Promise<WorldBanner[]> {
  const { data, error } = await supabase.rpc(RPC.GET_WORLD_BANNERS, { p_world_id: worldId });
  if (error || !Array.isArray(data)) return [];
  return data as WorldBanner[];
}

export async function dismissWorldBanner(supabase: Pick<SupabaseClient, "rpc">, id: string): Promise<boolean> {
  const { error } = await supabase.rpc(RPC.DISMISS_WORLD_BANNER, { p_announcement_id: id });
  return !error;
}

/**
 * Modifier une annonce envoyée (migration 235) : titre et texte (absents :
 * inchangés), et options. Notifications, messages privés et bandeaux suivent.
 */
export async function updateWorldAnnouncement(
  supabase: Pick<SupabaseClient, "rpc">,
  id: string,
  change: { title?: string; body?: string; extras?: AnnouncementExtras },
): Promise<{ ok: true } | { ok: false; reason: AnnouncementErrorReason }> {
  const extras = extrasToRpc(change.extras);
  const { error } = await supabase.rpc(RPC.UPDATE_WORLD_ANNOUNCEMENT, {
    p_id: id,
    p_title: change.title !== undefined ? change.title.trim() : null,
    p_body: change.body !== undefined ? change.body.trim() : null,
    p_extras: Object.keys(extras).length > 0 ? extras : null,
  });
  if (error) {
    console.error("[worldAnnouncements] modification", error);
    return { ok: false, reason: announcementErrorReason(error) };
  }
  return { ok: true };
}

/** Une annonce du widget de l'accueil (variables déjà remplacées par la base). */
export type HomeAnnouncement = {
  id: string;
  kind: AnnouncementKind;
  /** Absent pour un message privé. */
  title: string | null;
  body: string;
  label: AnnouncementLabel | null;
  image_url: string | null;
  pinned: boolean;
  created_at: string;
  edited_at: string | null;
  signed_as_world: boolean;
  /** Le monde, ou le pseudo de l'auteur. */
  signer: string | null;
  signer_avatar_url: string | null;
};

/** Nombre d'annonces que le widget peut montrer (miroir de la base). */
export const HOME_ANNOUNCEMENTS_MAX = 20;

export async function fetchHomeAnnouncements(
  supabase: Pick<SupabaseClient, "rpc">,
  worldId: string,
  limit = 5,
): Promise<HomeAnnouncement[]> {
  const { data, error } = await supabase.rpc(RPC.GET_WORLD_HOME_ANNOUNCEMENTS, {
    p_world_id: worldId,
    p_limit: Math.min(Math.max(limit, 1), HOME_ANNOUNCEMENTS_MAX),
  });
  if (error || !Array.isArray(data)) return [];
  return (data as HomeAnnouncement[]).map((a) => ({ ...a, label: isAnnouncementLabel(a.label) ? a.label : null }));
}

/**
 * Chemin de l'image d'en-tête d'une annonce, dans le bucket `worlds` : sous
 * le préfixe de son auteur (`user-<id>/`), le seul où la policy l'autorise à
 * écrire sans droit sur la carte ou le catalogue.
 */
export function announcementImagePath(userId: string, fileName: string): string {
  return `user-${userId}/announcements/${fileName}`;
}
