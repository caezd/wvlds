"use client";

import { useState, type ComponentProps } from "react";

import { AmountInput } from "@/components/economy/AmountInput";
import { cn } from "@/lib/utils";

type AmountProps = ComponentProps<typeof AmountInput>;

/**
 * Un montant qui peut être négatif : « + » ou « − » devant les cases
 * d'AmountInput, qui gardent la valeur absolue. Le sens choisi sur un montant
 * vide ou nul vaut pour la saisie qui suit. Pour les gains (migration 261).
 */
export function SignedAmountInput({
  value,
  onChange,
  signLabel,
  plusLabel,
  minusLabel,
  fieldClassName,
  ...amount
}: AmountProps & {
  /** Le nom accessible du choix du sens (« Sens : Par message »). */
  signLabel: string;
  plusLabel: string;
  minusLabel: string;
}) {
  const [negative, setNegative] = useState(value !== null && value < 0);
  const magnitude = value === null ? null : Math.abs(value);
  const signed = (abs: number | null, neg: boolean) => (abs === null ? null : neg ? -abs || 0 : abs);

  function choose(neg: boolean) {
    if (neg === negative) return;
    setNegative(neg);
    if (magnitude) onChange(signed(magnitude, neg));
  }

  const option = (neg: boolean, symbol: string, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={negative === neg}
      aria-label={label}
      title={label}
      onClick={() => choose(neg)}
      className={cn(
        "w-8 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        negative === neg ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {symbol}
    </button>
  );

  return (
    <div className="flex gap-2">
      <div
        role="radiogroup"
        aria-label={signLabel}
        className={cn("flex h-10 shrink-0 overflow-hidden rounded-md border divide-x divide-border", fieldClassName)}
      >
        {option(false, "+", plusLabel)}
        {option(true, "−", minusLabel)}
      </div>
      <div className="min-w-0 flex-1">
        <AmountInput
          {...amount}
          fieldClassName={fieldClassName}
          value={magnitude}
          onChange={(abs) => onChange(signed(abs, negative))}
        />
      </div>
    </div>
  );
}
