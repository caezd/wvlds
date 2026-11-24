import { z } from "zod";

/**
 * La monnaie d'un monde (migration 246), réglée dans Paramètres › Fonctions ›
 * Économie.
 *
 * Un monde a une seule monnaie, divisée en paliers (or, argent, cuivre…). La
 * base ne compte qu'en unité de base, la plus petite : un solde est un entier.
 * L'affichage décompose ce nombre selon les paliers — 500 cuivres s'écrivent
 * « 5 pa » —, la saisie le recompose. Chaque palier vaut un nombre entier du
 * palier suivant, si bien que la décomposition est unique.
 *
 * Fonctions pures, voir `lib/__tests__/worldCurrency.test.ts`.
 */

export type CurrencyUnit = {
  name: string;
  /** Abréviation affichée après les montants (« po ») ; vide : le nom. */
  short: string;
  /** Valeur en unités de base ; l'unité de base vaut 1. */
  value: number;
};

export const MAX_CURRENCY_UNITS = 5;
export const MAX_CURRENCY_NAME_LENGTH = 30;
export const MAX_CURRENCY_SHORT_LENGTH = 6;
/** Plafond de la valeur d'un palier ; tenu aussi par la base. */
export const MAX_CURRENCY_VALUE = 1_000_000_000_000;

export const DEFAULT_CURRENCY_UNITS: CurrencyUnit[] = [{ name: "Pièce", short: "", value: 1 }];

const unitSchema = z.strictObject({
  name: z.string().trim().min(1).max(MAX_CURRENCY_NAME_LENGTH),
  short: z.string().trim().max(MAX_CURRENCY_SHORT_LENGTH),
  value: z.number().int().min(1).max(MAX_CURRENCY_VALUE),
});

function byValueDesc(units: readonly CurrencyUnit[]): CurrencyUnit[] {
  return [...units].sort((a, b) => b.value - a.value);
}

/**
 * Les paliers acceptés : de un à cinq, une seule unité de base valant 1, des
 * valeurs distinctes, chacune multiple de la suivante. La même règle est tenue
 * par la base (`is_valid_currency_units`).
 */
export const currencyUnitsSchema = z
  .array(unitSchema)
  .min(1)
  .max(MAX_CURRENCY_UNITS)
  .refine((units) => {
    if (units.length === 0) return false;
    const sorted = byValueDesc(units);
    if (sorted[sorted.length - 1].value !== 1) return false;
    for (let i = 0; i < sorted.length - 1; i++) {
      const lower = sorted[i + 1].value;
      if (sorted[i].value === lower || sorted[i].value % lower !== 0) return false;
    }
    return true;
  });

/** Les paliers d'une ligne `worlds`, du plus grand au plus petit ; invalides : le défaut. */
export function currencyUnitsOf(raw: unknown): CurrencyUnit[] {
  const parsed = currencyUnitsSchema.safeParse(raw);
  return parsed.success ? byValueDesc(parsed.data) : DEFAULT_CURRENCY_UNITS;
}

export type AmountPart = { unit: CurrencyUnit; count: number };

/**
 * Un montant décomposé en paliers, du plus grand au plus petit, sans les
 * paliers à zéro. Zéro s'écrit dans l'unité de base ; un montant négatif se
 * décompose sur sa valeur absolue.
 */
export function splitAmount(amount: number, units: readonly CurrencyUnit[]): AmountPart[] {
  const sorted = byValueDesc(units);
  let rest = Math.abs(Math.trunc(amount));
  if (rest === 0) return [{ unit: sorted[sorted.length - 1], count: 0 }];
  const parts: AmountPart[] = [];
  for (const unit of sorted) {
    const count = Math.floor(rest / unit.value);
    if (count > 0) parts.push({ unit, count });
    rest -= count * unit.value;
  }
  return parts;
}

/** « 1 po 23 pa 45 pc » ; « −5 pa » pour un débit, « +5 pa » si `signed`. */
export function formatAmount(amount: number, units: readonly CurrencyUnit[], opts: { signed?: boolean } = {}): string {
  const body = splitAmount(amount, units)
    .map(({ unit, count }) => `${count} ${unit.short || unit.name}`)
    .join(" ");
  if (amount < 0) return `−${body}`;
  if (amount > 0 && opts.signed) return `+${body}`;
  return body;
}

/** Recompose une saisie par palier (rangée comme `units`, du plus grand au plus petit). */
export function amountFromCounts(counts: readonly number[], units: readonly CurrencyUnit[]): number {
  const sorted = byValueDesc(units);
  return sorted.reduce((sum, unit, i) => {
    const n = counts[i];
    return Number.isFinite(n) && n > 0 ? sum + Math.floor(n) * unit.value : sum;
  }, 0);
}

/**
 * Une ligne de l'éditeur des paliers : le taux dit combien du palier suivant
 * vaut celui-ci (« 1 Or = 100 Argent ») ; celui de l'unité de base est 1.
 */
export type CurrencyRatioRow = { name: string; short: string; ratio: number };

export function ratioRowsOf(units: readonly CurrencyUnit[]): CurrencyRatioRow[] {
  const sorted = byValueDesc(units);
  return sorted.map((u, i) => ({
    name: u.name,
    short: u.short,
    ratio: i < sorted.length - 1 ? u.value / sorted[i + 1].value : 1,
  }));
}

/** Les valeurs absolues tirées des taux ; la dernière ligne est l'unité de base. */
export function unitsFromRatioRows(rows: readonly CurrencyRatioRow[]): CurrencyUnit[] {
  const out: CurrencyUnit[] = [];
  let value = 1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (i < rows.length - 1) value *= Math.max(1, Math.floor(rows[i].ratio));
    out.unshift({ name: rows[i].name, short: rows[i].short, value });
  }
  return out;
}
