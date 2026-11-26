import type { ComponentProps } from "react";

import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { cn } from "@/lib/utils";
import { formatAmount, splitAmount, type CurrencyUnit } from "@/lib/worldCurrency";

/**
 * Un montant affiché, palier par palier, avec l'aspect que le monde a donné à
 * chacun (migration 265) : image, icône teintée, ou abréviation colorée. Sans
 * aspect, le texte de `formatAmount` tel quel. Les toasts et les phrases
 * passées à `t()` gardent `formatAmount` : ils ne rendent que du texte.
 *
 * L'abréviation reste dans le DOM quand une image ou une icône la remplace à
 * l'œil : un lecteur d'écran lit « 5 po », et le texte copié aussi.
 */
export function Money({
  amount,
  units,
  signed = false,
  className,
  ...props
}: {
  amount: number;
  units: readonly CurrencyUnit[];
  /** « +5 pa » pour un crédit ; un débit est toujours signé. */
  signed?: boolean;
} & Omit<ComponentProps<"span">, "children">) {
  const parts = splitAmount(amount, units);
  const base = cn("tabular-nums whitespace-nowrap", className);

  if (!parts.some(({ unit }) => unit.color || unit.icon || unit.image)) {
    return (
      <span className={base} {...props}>
        {formatAmount(amount, units, { signed })}
      </span>
    );
  }

  const sign = amount < 0 ? "−" : amount > 0 && signed ? "+" : "";
  return (
    <span className={base} {...props}>
      {sign}
      {parts.map(({ unit, count }, i) => (
        <span key={unit.value}>
          {i > 0 && " "}
          {count} <CurrencyMark unit={unit} />
        </span>
      ))}
    </span>
  );
}

/**
 * La marque d'un palier, après le nombre : son image, son icône, ou son
 * abréviation (colorée s'il a une couleur). Sert aussi d'aperçu au réglage.
 */
export function CurrencyMark({ unit, className }: { unit: CurrencyUnit; className?: string }) {
  const label = unit.short || unit.name;
  if (unit.image) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- vignette de la taille du texte, déjà réduite au téléversement */}
        <img
          src={unit.image}
          alt=""
          aria-hidden
          className={cn("inline-block size-[1.15em] rounded-sm object-contain align-[-0.2em]", className)}
        />
        <span className="sr-only">{label}</span>
      </>
    );
  }
  if (unit.icon) {
    return (
      <>
        <LazyLucideIcon
          name={unit.icon}
          aria-hidden
          style={unit.color ? { color: unit.color } : undefined}
          className={cn("inline-block size-[1em] align-[-0.125em]", className)}
        />
        <span className="sr-only">{label}</span>
      </>
    );
  }
  return (
    <span style={unit.color ? { color: unit.color } : undefined} className={className}>
      {label}
    </span>
  );
}
