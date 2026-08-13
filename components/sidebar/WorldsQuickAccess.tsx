"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe } from "lucide-react";
import { WorldAvatar } from "@/components/avatars/WorldAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";
import { cn } from "@/lib/utils";
import type { FavoriteWorld } from "@/lib/currentRequest";

/** Carte "Mondes" du rail d'icônes : le bouton lui-même ramène directement
 *  au dernier monde visité (`/w/<lastWorldId>` si le cookie est connu, sinon
 *  `/w` — point d'entrée dédié au bouton "mondes" de la sidebar, cf.
 *  lib/supabase/middleware.ts, qui délègue à `/` pour la résolution complète
 *  via app/page.tsx) — plus de toggle à ouvrir. Les mondes favoris restent
 *  affichés en permanence en dessous pour un accès rapide — cf. rail des
 *  mondes (WorldsRail), temporairement masqué au profit de ce panneau
 *  intégré. Sans favoris, le bouton redevient une icône de rail normale
 *  (pas de fond permanent) — sauf le pastille active (cf. RailIcon), affichée
 *  quand on est dans un monde ou une chatroom. Le favori déjà actif (monde
 *  courant ou chatroom de ce monde) n'est plus cliquable et gagne un
 *  contour accent, plutôt que de renaviguer vers la page déjà affichée. */
export function WorldsQuickAccess({
  worlds,
  label,
  lastWorldId,
}: {
  worlds: FavoriteWorld[];
  label: string;
  lastWorldId?: string | null;
}) {
  const hasFavorites = worlds.length > 0;
  const pathname = usePathname();
  const { activeWorldId } = useMobileSidebar();
  const isActive = (pathname?.startsWith("/w/") || pathname?.startsWith("/c/")) ?? false;
  const highlighted = hasFavorites || isActive;
  // Même logique que WorldsRail : `/w/<id>` révèle le monde directement dans
  // le pathname ; sur `/c/<id>` (chatroom), on retombe sur `activeWorldId`
  // poussé par ChatRoomView.
  const pathWorldId = pathname?.match(/^\/w\/([^/?]+)/)?.[1] ?? null;
  const currentWorldId = pathWorldId ?? activeWorldId;
  // Le bouton "Mondes" mène au monde du cookie : si on y est déjà, cliquer
  // ne ferait que renaviguer vers la page affichée.
  const isOnLastWorld = !!lastWorldId && currentWorldId === lastWorldId;

  return (
    // Le fond englobe d'un seul bloc arrondi le bouton et les mondes
    // favoris — toujours "ouvert" dès qu'il y en a, pas de padding ajouté :
    // le cadre colle exactement à la taille des boutons (h-9 w-9) empilés.
    <div className={cn("flex flex-col items-center gap-1 rounded-xl", hasFavorites && "bg-carbon-700")}>
      <Tooltip>
        <TooltipTrigger asChild>
          {(() => {
            const triggerClassName = cn(
              "relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:text-mist-50",
              highlighted ? "text-mist-50" : "text-mist-100",
              // Sans favoris, le fond de carte (sur le conteneur) ne s'affiche
              // pas — on le pose alors directement sur le bouton pour que la
              // pastille active ne se retrouve pas seule, sans boîte (cf. RailIcon).
              isActive && !hasFavorites && "bg-carbon-700",
            );
            const content = (
              <>
                {isActive && (
                  <span className="absolute w-[8px] h-[20px] bg-mist-50 -left-2 -translate-x-[6px] rounded-full" />
                )}
                <Globe size={17} />
              </>
            );
            return isOnLastWorld ? (
              <div aria-label={label} aria-current="page" className={cn(triggerClassName, "cursor-default")}>
                {content}
              </div>
            ) : (
              <Link href={lastWorldId ? `/w/${lastWorldId}` : "/w"} aria-label={label} className={triggerClassName}>
                {content}
              </Link>
            );
          })()}
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
      </Tooltip>

      {hasFavorites && (
        <div className="flex w-full flex-col items-center gap-1">
          {worlds.map((world) => {
            const isCurrent = world.id === currentWorldId;
            // L'anneau se pose sur l'avatar lui-même (via son `className`),
            // pas sur la boîte 9x9 qui l'entoure — sinon il flotte loin de
            // l'icône plutôt que de l'épouser.
            const avatar = <WorldAvatar world={world} size="sm" className={isCurrent ? "ring-2 ring-accent" : undefined} />;
            return (
              <Tooltip key={world.id}>
                <TooltipTrigger asChild>
                  {isCurrent ? (
                    <div aria-label={world.name} aria-current="page" className="flex h-9 w-9 cursor-default items-center justify-center rounded-xl">
                      {avatar}
                    </div>
                  ) : (
                    <Link href={`/w/${world.id}`} aria-label={world.name} className="flex h-9 w-9 items-center justify-center rounded-xl">
                      {avatar}
                    </Link>
                  )}
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>{world.name}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}
