import { z } from "zod";

import { MAX_CURRENCY_VALUE } from "@/lib/worldCurrency";

/**
 * Les gains automatiques d'un monde (migrations 252, 253) : la base crédite
 * les personas quand ils jouent — un message, une scène créée, rejointe ou
 * terminée, la première visite du jour. Réglés par monde dans la page
 * Devises, sans interrupteur : un montant à zéro ne paie rien. Un délai entre
 * deux messages payés et un plafond par jour tiennent les abus. Un montant
 * négatif retire, jusqu'à vider la bourse (migration 261).
 *
 * Fonctions pures, voir `lib/__tests__/worldGains.test.ts`. Les bornes sont
 * celles de la base, qui tranche en dernier ressort.
 */

/** Les déclencheurs, dans l'ordre de la page de réglages. */
export const GAIN_KINDS = ["message", "scene_joined", "scene_created", "scene_completed", "daily_login"] as const;
export type GainKind = (typeof GAIN_KINDS)[number];

/** Un gain ne dépasse pas la valeur maximale d'un palier de monnaie. */
export const MAX_GAIN = MAX_CURRENCY_VALUE;
/** Le délai entre deux messages payés, en minutes : au plus une journée. */
export const MAX_GAIN_COOLDOWN_MINUTES = 1440;

export type GainSettings = {
  gain_message: number;
  gain_scene_created: number;
  gain_scene_joined: number;
  gain_scene_completed: number;
  gain_daily_login: number;
  /** Minutes entre deux messages payés d'un même persona ; 0 : aucun délai. */
  gain_message_cooldown: number;
  /** Total des gains d'un persona par jour (UTC) ; `null` : sans plafond. */
  gain_daily_cap: number | null;
};

type GainRow = Partial<Record<keyof GainSettings, number | string | null>>;

const amountOf = (v: number | string | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

export function gainSettingsOf(row: GainRow | null | undefined): GainSettings {
  const cap = row?.gain_daily_cap;
  return {
    gain_message: amountOf(row?.gain_message),
    gain_scene_created: amountOf(row?.gain_scene_created),
    gain_scene_joined: amountOf(row?.gain_scene_joined),
    gain_scene_completed: amountOf(row?.gain_scene_completed),
    gain_daily_login: amountOf(row?.gain_daily_login),
    gain_message_cooldown: amountOf(row?.gain_message_cooldown),
    gain_daily_cap: cap === null || cap === undefined ? null : Number(cap),
  };
}

/** Un gain peut retirer (migration 261) ; le plafond, lui, reste positif. */
const amount = z.number().int().min(-MAX_GAIN).max(MAX_GAIN);
const positive = z.number().int().min(0).max(MAX_GAIN);

/** Ce que l'action serveur accepte. */
export const gainSettingsSchema = z.strictObject({
  gain_message: amount,
  gain_scene_created: amount,
  gain_scene_joined: amount,
  gain_scene_completed: amount,
  gain_daily_login: amount,
  gain_message_cooldown: z.number().int().min(0).max(MAX_GAIN_COOLDOWN_MINUTES),
  gain_daily_cap: positive.nullable(),
});

/** Les gains ne demandent que l'économie : ce sont leurs montants qui décident. */
export function worldHasGains(world: { enable_economy?: boolean | null } | null | undefined): boolean {
  return !!world && world.enable_economy === true;
}

/** La connexion du jour se réclame dès que son montant n'est pas nul, gain ou perte. */
export function worldHasDailyGain(
  world: { enable_economy?: boolean | null; gain_daily_login?: number | string | null } | null | undefined,
): boolean {
  return worldHasGains(world) && Number(world?.gain_daily_login ?? 0) !== 0;
}

/** Ce qu'un gain crédite vraiment, une fois le plafond du jour appliqué ; une perte n'y entre pas. Miroir de `economy_gain`. */
export function cappedGain(amount: number, gainedToday: number, cap: number | null): number {
  if (cap === null || amount < 0) return amount;
  return Math.max(0, Math.min(amount, cap - gainedToday));
}

/**
 * L'heure, sur l'appareil, où commence la journée des gains : la base compte
 * en jours UTC (connexion du jour, plafond), minuit UTC d'aujourd'hui donc.
 * `timeZone` ne sert qu'aux tests ; l'appareil décide sinon.
 */
export function dayStartLabel(locale: string, now: Date = new Date(), timeZone?: string): string {
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(midnight);
}
