"use client";

import { useState, type ComponentProps } from "react";

import { AmountInput } from "@/components/economy/AmountInput";
import { cn } from "@/lib/utils";

type AmountProps = ComponentProps<typeof AmountInput>;

/**
 * Un montant qui peut être négatif (gains, migration 261) : une case « + »
 * ou « − » devant celles d'AmountInput, qui gardent la valeur absolue. Un
 * clic inverse le montant et le transmet aussitôt. Sans montant, la case est
 * inactive : un sens choisi sur rien ne s'enregistrerait pas.
 */
export function SignedAmountInput({
  value,
  onChange,
  signLabel,
  fieldClassName,
  ...amount
}: AmountProps & {
  /** Le nom accessible de la case du sens (« Retirer au lieu de donner : Par message »). */
  signLabel: string;
}) {
  const [negative, setNegative] = useState(value !== null && value < 0);
  const magnitude = value === null ? null : Math.abs(value);
  const signed = (abs: number | null, neg: boolean) => (abs === null ? null : neg ? -abs || 0 : abs);

  function flip() {
    if (!magnitude) return;
    setNegative(!negative);
    onChange(signed(magnitude, !negative));
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={negative}
        aria-label={signLabel}
        disabled={!magnitude}
        onClick={flip}
        className={cn(
          fieldClassName,
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-base tabular-nums text-foreground transition-colors",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:text-muted-foreground",
        )}
      >
        {negative ? "−" : "+"}
      </button>
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
