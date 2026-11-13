"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Une carte cliquable ou à bascule (les chiffres en tête des pages Membres et
 * Personas, par exemple) : fond discret, contour, et au survol — sur un écran
 * à souris — une lueur en dégradé qui suit le pointeur.
 *
 * La position de la lueur passe par deux variables CSS posées directement sur
 * l'élément : suivre la souris ne provoque aucun rendu React. Animées par une
 * transition, elles font traîner la lueur derrière le pointeur.
 *
 * `active` marque une bascule enfoncée (`aria-pressed`) ; la teinte de l'état
 * actif reste à l'appelant, via `className`.
 */
export const InteractiveCard = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
>(function InteractiveCard({ active, className, onPointerMove, type = "button", children, ...props }, ref) {
  function followPointer(e: React.PointerEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--glow-x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--glow-y", `${e.clientY - rect.top}px`);
    onPointerMove?.(e);
  }

  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={active}
      data-slot="interactive-card"
      onPointerMove={followPointer}
      className={cn(
        "relative isolate overflow-hidden rounded-lg border border-border bg-muted/30 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Le fond (état actif), et la position de la lueur, qui traîne un peu
        // derrière le pointeur (variables animables déclarées dans app/globals.css).
        "[transition:background-color_150ms,border-color_150ms,--glow-x_500ms_cubic-bezier(0.2,0.8,0.2,1),--glow-y_500ms_cubic-bezier(0.2,0.8,0.2,1)]",
        // La lueur : un halo de la teinte de survol (`muted`) sous le contenu —
        // le fond de la carte, lui, ne change pas. Invisible hors survol. `hover:`
        // ne vaut que sur un appareil qui survole (Tailwind v4) : rien au doigt.
        "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100",
        "before:bg-[radial-gradient(220px_circle_at_var(--glow-x,50%)_var(--glow-y,50%),var(--muted),transparent_70%)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
