import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * La puce de l'application : une seule taille (20 px, texte de 11 px), une
 * seule forme (coins `rounded-md`), un fond doux et le texte de la couleur du
 * ton. Le ton dit le sens, pas la fonctionnalité : un statut « en pause » et
 * une fiche « à relire » sont tous deux `warning`.
 *
 * Une couleur choisie par un joueur (rôle, groupe) ne se met pas en fond :
 * `neutral` avec une pastille (`<BadgeDot color=… />`) en tête.
 */
const badgeVariants = cva(
  "inline-flex h-5 max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs-plus font-semibold [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-foreground",
        accent: "bg-accent-soft text-accent",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-destructive-soft text-destructive",
        info: "bg-info-soft text-info",
        npc: "bg-npc-soft text-npc",
        /** Plein : ce qui doit se voir de loin (un badge officiel, un plan). */
        solid: "bg-primary text-primary-foreground",
        outline: "border border-dashed border-border text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span data-slot="badge" data-tone={tone ?? "neutral"} className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** La pastille d'une couleur de joueur, en tête d'un badge `neutral`. */
function BadgeDot({ color, className }: { color?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-xs", !color && "bg-muted-foreground", className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

export { Badge, BadgeDot, badgeVariants };
