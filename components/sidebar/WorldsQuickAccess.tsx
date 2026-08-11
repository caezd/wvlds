"use client";

import { useState } from "react";
import Link from "next/link";
import { Globe } from "lucide-react";
import { WorldAvatar } from "@/components/avatars/WorldAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FavoriteWorld } from "@/lib/currentRequest";

/** Bouton "Mondes" du rail d'icônes : déplie sur place (pas de panneau
 *  flottant séparé) les mondes favoris de l'utilisateur pour un accès rapide
 *  — cf. rail des mondes (WorldsRail), temporairement masqué au profit de ce
 *  panneau intégré. */
export function WorldsQuickAccess({
  worlds,
  label,
}: {
  worlds: FavoriteWorld[];
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    // Le fond ne se limite pas au bouton : replié, seule sa forme (h-9 w-9)
    // compte ; déplié, ce même conteneur s'étire pour envelopper d'un seul
    // bloc arrondi le bouton et le contenu déplié (mondes favoris).
    // Pas de padding ajouté : le cadre colle exactement à la taille des
    // boutons (h-9 w-9) empilés, le bouton ne change pas de taille à l'ouverture.
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl transition-colors",
        open && "bg-carbon-700",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={label}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:text-mist-50",
              open ? "text-mist-50" : "text-mist-100",
            )}
          >
            {open && (
              <span className="absolute w-[8px] h-[20px] bg-mist-50 -left-2 -translate-x-[6px] rounded-full" />
            )}
            <Globe size={17} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
      </Tooltip>

      {open && worlds.length > 0 && (
        <div className="flex w-full flex-col items-center gap-1">
          {worlds.map((world) => (
            <Tooltip key={world.id}>
              <TooltipTrigger asChild>
                <Link
                  href={`/w/${world.id}`}
                  aria-label={world.name}
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                >
                  <WorldAvatar world={world} size="sm" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>{world.name}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}
