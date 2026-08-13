"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe } from "lucide-react";
import { WorldAvatar } from "@/components/avatars/WorldAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FavoriteWorld } from "@/lib/currentRequest";

/** Carte "Mondes" du rail d'icônes : le bouton lui-même ramène directement
 *  au dernier monde visité (`/` redirige via le cookie `last_world_id`, cf.
 *  app/page.tsx) — plus de toggle à ouvrir. Les mondes favoris restent
 *  affichés en permanence en dessous pour un accès rapide — cf. rail des
 *  mondes (WorldsRail), temporairement masqué au profit de ce panneau
 *  intégré. Sans favoris, le bouton redevient une icône de rail normale
 *  (pas de fond permanent) — sauf le pastille active (cf. RailIcon), affichée
 *  quand on est dans un monde ou une chatroom. */
export function WorldsQuickAccess({
  worlds,
  label,
}: {
  worlds: FavoriteWorld[];
  label: string;
}) {
  const hasFavorites = worlds.length > 0;
  const pathname = usePathname();
  const isActive = (pathname?.startsWith("/w/") || pathname?.startsWith("/c/")) ?? false;
  const highlighted = hasFavorites || isActive;

  return (
    // Le fond englobe d'un seul bloc arrondi le bouton et les mondes
    // favoris — toujours "ouvert" dès qu'il y en a, pas de padding ajouté :
    // le cadre colle exactement à la taille des boutons (h-9 w-9) empilés.
    <div className={cn("flex flex-col items-center gap-1 rounded-xl", hasFavorites && "bg-carbon-700")}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/"
            aria-label={label}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:text-mist-50",
              highlighted ? "text-mist-50" : "text-mist-100",
              // Sans favoris, le fond de carte (sur le conteneur) ne s'affiche
              // pas — on le pose alors directement sur le bouton pour que la
              // pastille active ne se retrouve pas seule, sans boîte (cf. RailIcon).
              isActive && !hasFavorites && "bg-carbon-700",
            )}
          >
            {isActive && (
              <span className="absolute w-[8px] h-[20px] bg-mist-50 -left-2 -translate-x-[6px] rounded-full" />
            )}
            <Globe size={17} />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
      </Tooltip>

      {hasFavorites && (
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
