import { RPC } from "@/lib/constants";
import { daysInMonth } from "@/lib/worldTimeline";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

/** Une icône de météo posée à un moment de la journée, de 0 (aube) à 100 (nuit). */
export type DayPoint = { icon: string; position: number };

/**
 * Le temps d'un salon (migrations 275 et 277), comme ses deux dates : celui
 * du départ (réglé à la création ou dans les réglages, affiché en tête du
 * fil) et celui en cours, que les ellipses avancent.
 */
export type ChatroomDay = {
  start: DayPoint | null;
  /** Nul tant qu'aucune ellipse n'a fait passer le temps. */
  current: DayPoint | null;
};

/** Ce qu'une ligne du temps affiche : une icône, et le saut qui l'y a menée. */
export type DayLine = DayPoint & {
  /** L'icône d'avant le saut, quand des jours ont passé. */
  fromIcon: string | null;
  fromPosition: number | null;
  /** Les jours passés. */
  skipped: number;
};

function dayPoint(icon: string | null | undefined, position: number | null | undefined): DayPoint | null {
  return icon && position !== null && position !== undefined ? { icon, position } : null;
}

/** Les colonnes du salon (`chatrooms.day_*`) en un temps, ou `null` sans aucun. */
export function chatroomDayFromRow(row: {
  day_icon?: string | null;
  day_position?: number | null;
  day_current_icon?: string | null;
  day_current_position?: number | null;
}): ChatroomDay | null {
  const start = dayPoint(row.day_icon, row.day_position);
  const current = dayPoint(row.day_current_icon, row.day_current_position);
  return start || current ? { start, current } : null;
}

/** Le temps qu'il fait maintenant dans le salon : le dernier posé par une ellipse, sinon celui du départ. */
export function dayNow(day: ChatroomDay | null | undefined): DayPoint | null {
  return day?.current ?? day?.start ?? null;
}

/** Une ligne sans saut, l'icône à sa place. */
export function dayLineAt(point: DayPoint): DayLine {
  return { ...point, fromIcon: null, fromPosition: null, skipped: 0 };
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
