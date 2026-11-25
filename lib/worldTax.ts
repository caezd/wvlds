import { z } from "zod";

import { MAX_CURRENCY_VALUE } from "@/lib/worldCurrency";

/**
 * La taxe des personas (migration 255) : un montant fixe, dû par chaque
 * persona joueur du monde à chaque période (tous les N jours, semaines ou
 * mois depuis une date de départ). Une période échue non payée met le
 * persona en défaut : un badge à côté de son nom.
 *
 * Fonctions pures, voir `lib/__tests__/worldTax.test.ts`. La base tient les
 * dettes, les échéances (pg_cron) et les paiements.
 */

export const TAX_UNITS = ["day", "week", "month"] as const;
export type TaxUnit = (typeof TAX_UNITS)[number];

export const TAX_MODES = ["manual", "auto"] as const;
export type TaxMode = (typeof TAX_MODES)[number];

export const MAX_TAX_EVERY = 365;
export const MAX_TAX_BADGE_LENGTH = 24;

export type TaxSettings = {
  tax_enabled: boolean;
  tax_amount: number;
  tax_every: number;
  tax_unit: TaxUnit;
  /** Début de la première période, en ISO. */
  tax_anchor: string;
  tax_mode: TaxMode;
  /** Les périodes manquées s'additionnent ; sinon seule la dernière reste due. */
  tax_accumulate: boolean;
  /** Un nouveau persona ne doit rien avant la fin de sa première période. */
  tax_grace_new: boolean;
  /** `null` : le texte de l'application. */
  tax_badge_label: string | null;
};

type TaxRow = Partial<Record<keyof TaxSettings, unknown>>;

export function taxSettingsOf(row: TaxRow | null | undefined): TaxSettings {
  const unit = TAX_UNITS.includes(row?.tax_unit as TaxUnit) ? (row!.tax_unit as TaxUnit) : "month";
  const mode = TAX_MODES.includes(row?.tax_mode as TaxMode) ? (row!.tax_mode as TaxMode) : "manual";
  const label = typeof row?.tax_badge_label === "string" && row.tax_badge_label.trim() ? row.tax_badge_label : null;
  return {
    tax_enabled: row?.tax_enabled === true,
    tax_amount: Number(row?.tax_amount ?? 0) || 0,
    tax_every: Number(row?.tax_every ?? 1) || 1,
    tax_unit: unit,
    tax_anchor: typeof row?.tax_anchor === "string" ? row.tax_anchor : new Date().toISOString(),
    tax_mode: mode,
    tax_accumulate: row?.tax_accumulate !== false,
    tax_grace_new: row?.tax_grace_new !== false,
    tax_badge_label: label,
  };
}

/** Ce que l'action serveur accepte. */
export const taxSettingsSchema = z.strictObject({
  tax_enabled: z.boolean(),
  tax_amount: z.number().int().min(0).max(MAX_CURRENCY_VALUE),
  tax_every: z.number().int().min(1).max(MAX_TAX_EVERY),
  tax_unit: z.enum(TAX_UNITS),
  tax_anchor: z.iso.datetime({ offset: true }),
  tax_mode: z.enum(TAX_MODES),
  tax_accumulate: z.boolean(),
  tax_grace_new: z.boolean(),
  tax_badge_label: z.string().trim().min(1).max(MAX_TAX_BADGE_LENGTH).nullable(),
});

/** Une dette non réglée (`persona_tax_dues`). */
export type TaxDue = { id: string; period_start: string; period_end: string; amount: number };

export type TaxStatus = {
  /** Périodes échues non payées : le persona est en défaut. */
  overdueCount: number;
  overdueTotal: number;
  /** Tout ce qui reste dû, période en cours comprise. */
  unpaidCount: number;
  unpaidTotal: number;
};

export function taxStatusOf(dues: readonly TaxDue[], now: Date = new Date()): TaxStatus {
  let overdueCount = 0;
  let overdueTotal = 0;
  let unpaidTotal = 0;
  for (const d of dues) {
    const amount = Number(d.amount);
    unpaidTotal += amount;
    if (new Date(d.period_end).getTime() <= now.getTime()) {
      overdueCount += 1;
      overdueTotal += amount;
    }
  }
  return { overdueCount, overdueTotal, unpaidCount: dues.length, unpaidTotal };
}
