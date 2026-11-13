import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * La hiérarchie des boutons, la même dans toute l'application :
 *
 * - les ACTIONS — ce qui enregistre en base ou envoie — sont en pilule :
 *   `default` pour l'action principale (primary), `secondary` pour la seconde
 *   (dont « Annuler » à côté d'elle), `destructive` pour celle qui supprime ;
 * - un bouton qui ne fait qu'ouvrir de l'interface (tiroir, dialogue,
 *   formulaire, mode édition) n'est pas une action, même s'il dit « Nouveau… » ;
 * - les autres boutons (filtres, outils, bascules) sont en `rounded-md` :
 *   `outline` quand ils portent une bordure, `ghost` sans bordure (« Aujourd'hui »
 *   dans la chronologie, boutons d'icône d'une barre d'outils).
 *
 * Une bascule (`aria-pressed`) en `outline` ou `ghost` garde, enfoncée, le
 * fond du survol : pas de surcharge à écrire.
 *
 * Pas de bouton maison : un `<button>` qui ressemble à un bouton passe par
 * `Button` ou `buttonVariants`.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-hidden focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "rounded-full bg-primary text-primary-foreground hover:bg-primary/85",
        secondary: "rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "rounded-full bg-destructive/60 text-white hover:bg-destructive/90 focus-visible:ring-destructive/40",
        outline:
          "rounded-md border border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground",
        ghost: "rounded-md text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        /** Un ajout discret posé dans une barre (« + Ajouter » d'une barre d'onglets). */
        xs: "h-7 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
