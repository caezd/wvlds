import { z } from "zod";

/**
 * La connexion à la chatbox d'un monde (migration 244), réglée dans
 * Paramètres › Fonctions › Chatbox › Connexion :
 * - `joinMode` : connecté dès l'arrivée dans le monde (`auto`, comme avant)
 *   ou en cliquant sur « Rejoindre » (`button`) ;
 * - `idleMinutes` : sans message ni frappe pendant ce temps, le joueur est
 *   déconnecté ; `null` : jamais ;
 * - `offlineView` : ce que voit un joueur non connecté, rien (`none`) ou les
 *   messages en lecture seule (`read`).
 *
 * Les deux derniers ne valent qu'avec « Rejoindre » (migration 245) : en
 * `auto`, la connexion n'est pas tenue, tout le monde est présent d'office
 * (le comportement d'avant la migration 244) ; un délai enregistré attend.
 */
export const LIVE_CHAT_CONNECTION_FIELDS = [
  "live_chat_join_mode",
  "live_chat_idle_minutes",
  "live_chat_offline_view",
] as const;

export const LIVE_CHAT_JOIN_MODES = ["auto", "button"] as const;
export type LiveChatJoinMode = (typeof LIVE_CHAT_JOIN_MODES)[number];

export const LIVE_CHAT_OFFLINE_VIEWS = ["none", "read"] as const;
export type LiveChatOfflineView = (typeof LIVE_CHAT_OFFLINE_VIEWS)[number];

/** Les délais proposés, en minutes (la base accepte de 1 à 1440). */
export const LIVE_CHAT_IDLE_PRESETS = [5, 10, 15, 30, 60, 120] as const;
export type LiveChatIdlePreset = (typeof LIVE_CHAT_IDLE_PRESETS)[number];

export type LiveChatConnection = {
  joinMode: LiveChatJoinMode;
  idleMinutes: number | null;
  offlineView: LiveChatOfflineView;
};

export const DEFAULT_LIVE_CHAT_CONNECTION: LiveChatConnection = { joinMode: "auto", idleMinutes: null, offlineView: "none" };

type ConnectionRow = {
  live_chat_join_mode?: string | null;
  live_chat_idle_minutes?: number | null;
  live_chat_offline_view?: string | null;
};

/** Les réglages d'une ligne `worlds` ; absents ou inconnus : les défauts. */
export function liveChatConnectionOf(row: ConnectionRow | null | undefined): LiveChatConnection {
  const mode = row?.live_chat_join_mode;
  const view = row?.live_chat_offline_view;
  const idle = row?.live_chat_idle_minutes;
  return {
    joinMode: (LIVE_CHAT_JOIN_MODES as readonly unknown[]).includes(mode) ? (mode as LiveChatJoinMode) : "auto",
    idleMinutes: typeof idle === "number" && idle >= 1 ? idle : null,
    offlineView: (LIVE_CHAT_OFFLINE_VIEWS as readonly unknown[]).includes(view) ? (view as LiveChatOfflineView) : "none",
  };
}

/** La connexion est-elle tenue ? Seulement avec le bouton Rejoindre. */
export function liveChatSessionsOn(c: LiveChatConnection): boolean {
  return c.joinMode === "button";
}

/** L'heure (ms) où la connexion tombe sans nouvelle activité ; `null` : jamais. */
export function liveChatIdleDeadline(lastActiveAt: string, idleMinutes: number | null): number | null {
  if (idleMinutes === null) return null;
  return Date.parse(lastActiveAt) + idleMinutes * 60_000;
}

/** Ce que l'action serveur accepte : un ou plusieurs réglages, rien d'autre. */
export const liveChatConnectionPatchSchema = z
  .strictObject({
    live_chat_join_mode: z.enum(LIVE_CHAT_JOIN_MODES),
    live_chat_idle_minutes: z.union([z.literal(LIVE_CHAT_IDLE_PRESETS), z.null()]),
    live_chat_offline_view: z.enum(LIVE_CHAT_OFFLINE_VIEWS),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0);

export type LiveChatConnectionPatch = z.input<typeof liveChatConnectionPatchSchema>;
