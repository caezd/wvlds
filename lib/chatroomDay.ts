import { RPC } from "@/lib/constants";
import { daysInMonth } from "@/lib/worldTimeline";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

/**
 * Le temps d'un salon (migration 275) : une icône de météo posée à un moment
 * de la journée, sur une ligne de 0 (aube) à 100 (nuit). Une ellipse déplace
 * l'icône et fait passer des jours ; le salon garde le saut de la dernière.
 */
export type ChatroomDay = {
  icon: string;
  position: number;
  /** L'icône d'avant la dernière ellipse, quand des jours ont passé. */
  fromIcon: string | null;
  fromPosition: number | null;
  /** Les jours passés par la dernière ellipse. */
  skipped: number;
};

/** Les colonnes du salon (`chatrooms.day_*`) en un statut, ou `null` sans icône. */
export function chatroomDayFromRow(row: {
  day_icon?: string | null;
  day_position?: number | null;
  day_from_icon?: string | null;
  day_from_position?: number | null;
  day_skipped?: number | null;
}): ChatroomDay | null {
  if (!row.day_icon || row.day_position === null || row.day_position === undefined) return null;
  return {
    icon: row.day_icon,
    position: row.day_position,
    fromIcon: row.day_from_icon ?? null,
    fromPosition: row.day_from_position ?? null,
    skipped: row.day_skipped ?? 0,
  };
}

/** Les icônes proposées (lucide), dans l'ordre d'une journée puis du temps qu'il fait. */
export const DAY_WEATHER_ICONS = [
  "sunrise",
  "sun",
  "sun-dim",
  "cloud-sun",
  "cloudy",
  "cloud",
  "cloud-drizzle",
  "cloud-rain",
  "cloud-lightning",
  "cloud-snow",
  "snowflake",
  "cloud-fog",
  "wind",
  "sunset",
  "cloud-moon",
  "moon-star",
] as const;

/** Où l'icône se pose par défaut : l'aube. */
export const DAY_DEFAULT_ICON = "sunrise";
export const DAY_DEFAULT_POSITION = 10;

export type DayMoment = "dawn" | "morning" | "noon" | "afternoon" | "dusk" | "night";

/** Le moment de la journée d'une position (clé `chatrooms.day.moments.*`). */
export function dayMoment(position: number): DayMoment {
  if (position < 10) return "dawn";
  if (position < 35) return "morning";
  if (position < 60) return "noon";
  if (position < 75) return "afternoon";
  if (position < 88) return "dusk";
  return "night";
}

/** Au-delà de ce nombre de jours, les pointillés s'arrêtent sur « ··· ». */
export const DAY_DASHES_MAX = 7;

export function dayDashes(skipped: number): { dashes: number; overflow: boolean } {
  const days = Math.max(0, Math.floor(skipped));
  return { dashes: Math.min(days, DAY_DASHES_MAX), overflow: days > DAY_DASHES_MAX };
}

/** Le plus long saut qu'une ellipse accepte (la base le borne aussi). */
export const ELLIPSE_MAX_DAYS = 36500;

/**
 * Miroir de `timeline_add_days` (migration 275). Une année seule ne bouge
 * pas ; une date sans jour part du 1er du mois.
 */
export function addTimelineDays(config: WorldTimelineConfig, date: WorldTimelineDate, days: number): WorldTimelineDate {
  const months = config.month_names.length;
  if (days <= 0 || months === 0 || date.month === null) return date;
  let year = date.year;
  let month = Math.min(Math.max(date.month, 0), months - 1);
  let day = (date.day ?? 1) + days;
  while (day > daysInMonth(config, month)) {
    day -= daysInMonth(config, month);
    month += 1;
    if (month >= months) {
      month = 0;
      year += 1;
    }
  }
  return { year, month, day };
}

export type EllipseRequest = { days: number; icon: string; position: number };

/** Une ellipse telle que la base l'a posée (`chatroom_ellipses`). */
export type ChatroomEllipse = {
  id: string;
  days: number;
  from_icon: string | null;
  from_position: number | null;
  to_icon: string;
  to_position: number;
  from_date: WorldTimelineDate | null;
  to_date: WorldTimelineDate | null;
};

export type EllipseErrorKey = "notAllowed" | "invalid" | "failed";

export function ellipseErrorKey(message: string | null | undefined): EllipseErrorKey {
  if (!message) return "failed";
  if (message.includes("not_allowed") || message.includes("not_authenticated")) return "notAllowed";
  if (message.includes("ellipse_invalid")) return "invalid";
  return "failed";
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

/**
 * Fait poser l'ellipse par la base (`post_chatroom_ellipse`), qui met aussi le
 * salon à jour, puis rend le texte du message qui la publie et l'id à poser
 * dans `chat_messages.ellipse_id`.
 */
export async function postEllipseForMessage(
  supabase: RpcClient,
  chatId: string,
  request: EllipseRequest,
): Promise<{ ok: true; text: string; ellipseId: string } | { ok: false; error: EllipseErrorKey }> {
  const { data, error } = await supabase.rpc(RPC.POST_CHATROOM_ELLIPSE, {
    p_chat: chatId,
    p_days: request.days,
    p_icon: request.icon,
    p_position: request.position,
  });
  if (error || !data) return { ok: false, error: ellipseErrorKey(error?.message) };
  return { ok: true, ellipseId: (data as { id: string }).id, text: JSON.stringify({ _type: "ellipse" }) };
}
