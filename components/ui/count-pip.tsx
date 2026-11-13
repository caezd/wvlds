import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Le compteur rouge des non-lus, des demandes, des notifications : une seule
 * forme, posée sur une icône ou un avatar. Le liseré du fond le détache de ce
 * qu'il recouvre. `max` plafonne l'affichage (« 99+ »).
 *
 * Fond `accent-strong` et non `accent` : le chiffre blanc de 10 px n'atteint
 * pas 4.5:1 sur le rouge de la marque.
 *
 * Le placer revient à l'appelant (`className="absolute -right-0.5 -top-0.5"`).
 */
export function CountPip({
  count,
  max = 99,
  className,
  ...props
}: {
  count: number;
  max?: number;
} & Omit<HTMLAttributes<HTMLSpanElement>, "children">) {
  if (count <= 0) return null;
  return (
    <span
      {...props}
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-strong px-1 text-2xs font-bold tabular-nums leading-none text-accent-foreground ring-2 ring-background",
        className,
      )}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}
