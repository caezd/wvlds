"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

/**
 * L'aide d'un réglage, partout dans l'application : un point d'interrogation
 * en bout de ligne, qui ouvre l'explication dans une carte. Il remplace les
 * longues descriptions sous un titre ; l'explication ne donne pas d'exemples.
 *
 *     <HelpHint title={t("seasons")}>{t("seasonsHelp")}</HelpHint>
 *
 * - au survol ou au focus clavier (Entrée ou Espace la basculent) ; au
 *   toucher, un appui l'ouvre et la referme (le survol n'existe pas sur
 *   mobile) ;
 * - son nom est « Aide : <title> » (« Aide » sans titre), et les lecteurs
 *   d'écran lisent l'explication comme sa description, sans ouvrir la carte ;
 * - dans un `<label>`, un appui n'active pas le champ voisin.
 */
export function HelpHint({
  title,
  children,
  side = "top",
  align = "end",
  className,
}: {
  /** Ce que l'aide explique : donne son nom au bouton. */
  title?: string;
  /** L'explication. */
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const descriptionId = React.useId();
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={title ? t("helpFor", { title }) : t("help")}
          aria-describedby={descriptionId}
          aria-expanded={open}
          // Au toucher (ni survol ni focus visibles), un appui bascule la
          // carte ; au clavier (Entrée, Espace : un clic sans pointeur),
          // aussi. La souris, elle, passe par le survol.
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse") setOpen((v) => !v);
          }}
          onClick={(e) => {
            e.preventDefault();
            if (e.detail === 0) setOpen((v) => !v);
          }}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          data-testid="help-hint"
        >
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </HoverCardTrigger>
      <span id={descriptionId} className="sr-only">{children}</span>
      <HoverCardContent side={side} align={align} className="w-72 p-3 text-xs leading-relaxed text-muted-foreground" aria-hidden>
        {children}
      </HoverCardContent>
    </HoverCard>
  );
}
