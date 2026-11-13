"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { letterAnchor } from "./PersonaShelf";

/**
 * L'index A–Z du mode Liste, collé en haut du défilement. Des boutons plutôt
 * que des ancres : sauter à une lettre ne doit pas toucher à l'URL (`?persona=`).
 */
export function AlphaIndex({ letters }: { letters: string[] }) {
  const t = useTranslations("personas.list.shelves");
  if (letters.length < 2) return null;
  return (
    <nav aria-label={t("alphaIndex")} className="sticky top-0 z-10 -my-2 flex flex-wrap gap-1 bg-background py-2">
      {letters.map((l) => (
        <Button
          key={l}
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => document.getElementById(letterAnchor(l))?.scrollIntoView({ block: "start", behavior: "smooth" })}
          className="h-[30px] w-auto min-w-[30px] px-1.5 text-xs font-semibold"
        >
          {l}
        </Button>
      ))}
    </nav>
  );
}
