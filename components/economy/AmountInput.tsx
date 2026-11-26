"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { amountFromCounts, splitAmount, type CurrencyUnit } from "@/lib/worldCurrency";
import { digitsOnly } from "@/lib/digitsOnly";
import { cn } from "@/lib/utils";

/** Les cases d'un montant déjà connu, palier par palier ; vides s'il n'y en a pas. */
function countsOf(value: number | null, units: readonly CurrencyUnit[]): number[] {
  if (value === null) return units.map(() => NaN);
  const parts = splitAmount(value, units);
  return units.map((unit) => parts.find((p) => p.unit.value === unit.value)?.count ?? NaN);
}

/**
 * Un montant saisi palier par palier (« 2 Or 50 Argent »), recomposé en
 * unités de base. Chaque palier a son champ −/+ (NumberInput), le même que
 * pour toute quantité ; `compact` serre les cases pour les réglages. `units` du plus grand au plus petit, comme les rend
 * `currencyUnitsOf`. Toutes les cases vides : `null`.
 */
export function AmountInput({
  units,
  value,
  onChange,
  idPrefix,
  labelOf,
  compact = false,
  placeholder,
  fieldClassName,
}: {
  units: CurrencyUnit[];
  value: number | null;
  onChange: (amount: number | null) => void;
  idPrefix: string;
  /** Le nom accessible d'une case (« Prix en Or »). */
  labelOf: (unit: CurrencyUnit) => string;
  /**
   * Une rangée de cases qui se partagent la largeur, sans intitulé au-dessus : l'abréviation du
   * palier dans la case (« [ 12 S ] »). Pour les réglages, sous un seul libellé.
   */
  compact?: boolean;
  /** Ce qu'affichent les cases vides (`compact`) : « 0 », « — »… */
  placeholder?: string;
  /** Le fond et la bordure des cases (`compact`), selon la surface. */
  fieldClassName?: string;
}) {
  const [counts, setCounts] = useState<number[]>(() => countsOf(value, units));

  function update(i: number, v: number) {
    const next = [...counts];
    next[i] = v;
    setCounts(next);
    onChange(next.every((n) => !Number.isFinite(n)) ? null : amountFromCounts(next, units));
  }

  if (compact) {
    return (
      <div className="flex gap-2">
        {units.map((unit, i) => (
          <div key={unit.value} className="relative min-w-0 flex-1">
            <Input
              id={`${idPrefix}-${unit.value}`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              {...digitsOnly}
              aria-label={labelOf(unit)}
              placeholder={placeholder}
              value={Number.isFinite(counts[i]) ? counts[i] : ""}
              onChange={(e) => update(i, e.target.valueAsNumber)}
              className={cn(
                "h-10 rounded-md pr-10 text-sm tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                fieldClassName,
              )}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center truncate text-xs text-muted-foreground"
            >
              {unit.short || unit.name}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {units.map((unit, i) => (
        <div key={unit.value} className="space-y-1">
          <Label htmlFor={`${idPrefix}-${unit.value}`} className="text-xs text-muted-foreground">
            {unit.name}
          </Label>
          <NumberInput
            id={`${idPrefix}-${unit.value}`}
            min={0}
            {...digitsOnly}
            aria-label={labelOf(unit)}
            value={Number.isFinite(counts[i]) ? counts[i] : null}
            onValueChange={(v) => update(i, v === null ? NaN : v)}
          />
        </div>
      ))}
    </div>
  );
}
