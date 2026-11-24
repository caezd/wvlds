"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { amountFromCounts, splitAmount, type CurrencyUnit } from "@/lib/worldCurrency";

/** Les cases d'un montant déjà connu, palier par palier ; vides s'il n'y en a pas. */
function countsOf(value: number | null, units: readonly CurrencyUnit[]): number[] {
  if (value === null) return units.map(() => NaN);
  const parts = splitAmount(value, units);
  return units.map((unit) => parts.find((p) => p.unit.value === unit.value)?.count ?? NaN);
}

/**
 * Un montant saisi palier par palier (« 2 Or 50 Argent »), recomposé en
 * unités de base. `units` du plus grand au plus petit, comme les rend
 * `currencyUnitsOf`. Toutes les cases vides : `null`.
 */
export function AmountInput({
  units,
  value,
  onChange,
  idPrefix,
  labelOf,
  stepper = false,
}: {
  units: CurrencyUnit[];
  value: number | null;
  onChange: (amount: number | null) => void;
  idPrefix: string;
  /** Le nom accessible d'une case (« Prix en Or »). */
  labelOf: (unit: CurrencyUnit) => string;
  /** Des boutons −/+ à côté de chaque case (NumberInput). */
  stepper?: boolean;
}) {
  const [counts, setCounts] = useState<number[]>(() => countsOf(value, units));

  function update(i: number, v: number) {
    const next = [...counts];
    next[i] = v;
    setCounts(next);
    onChange(next.every((n) => !Number.isFinite(n)) ? null : amountFromCounts(next, units));
  }

  return (
    <div className="flex flex-wrap gap-3">
      {units.map((unit, i) => (
        <div key={unit.value} className={stepper ? "space-y-1" : "w-28 space-y-1"}>
          <Label htmlFor={`${idPrefix}-${unit.value}`} className="text-xs text-muted-foreground">
            {unit.name}
          </Label>
          {stepper ? (
            <NumberInput
              id={`${idPrefix}-${unit.value}`}
              min={0}
              aria-label={labelOf(unit)}
              value={Number.isFinite(counts[i]) ? counts[i] : null}
              onValueChange={(v) => update(i, v === null ? NaN : v)}
            />
          ) : (
            <Input
              id={`${idPrefix}-${unit.value}`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              aria-label={labelOf(unit)}
              value={Number.isFinite(counts[i]) ? counts[i] : ""}
              onChange={(e) => update(i, e.target.valueAsNumber)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
