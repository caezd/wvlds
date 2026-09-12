"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Globe, GlobeLock, Search, Star } from "lucide-react";

import { WorldHeroCard } from "./WorldHeroCard";
import { MobileDrawerOpenButton } from "@/components/sidebar/MobileDrawerOpenButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { World } from "@/types/worlds";
import { cn } from "@/lib/utils";
import { supabaseThumb } from "@/lib/storage";

/** Hauteur de la barre, en pixels — à garder en phase avec `h-14`. */
export const WORLD_HOME_HEADER_HEIGHT = 56;

const BUTTON_CLASS =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/45";

/**
 * Icône du monde (ou globe selon la visibilité, à défaut). `size` en pixels
 * CSS ; l'image est demandée en ×3 à imgproxy pour les écrans haute densité.
 */
export function WorldHomeIcon({
  world,
  size,
  className,
}: {
  world: Pick<World, "icon_url" | "visibility">;
  size: number;
  className?: string;
}) {
  return (
    <span
      className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted", className)}
      style={{ width: size, height: size }}
    >
      {world.icon_url ? (
        // `unoptimized` : `sizes` en px fixe (pas `vw`) fait demander à
        // Next.js sa plus grande largeur configurée (jusqu'à 3840px) au lieu
        // d'une taille adaptée — voir le commentaire détaillé dans
        // WorldAvatar.tsx. On pré-dimensionne donc nous-mêmes via imgproxy.
        <Image
          src={supabaseThumb(world.icon_url, size * 3, 90) ?? world.icon_url}
          alt=""
          fill
          unoptimized
          className="object-cover"
        />
      ) : world.visibility === "public" ? (
        <Globe size={Math.round(size / 2.2)} className="text-muted-foreground" />
      ) : (
        <GlobeLock size={Math.round(size / 2.2)} className="text-muted-foreground" />
      )}
    </span>
  );
}

/**
 * Barre collante en haut de la page d'accueil : menu mobile, recherche,
 * favori. Posée en tête du conteneur qui défile, elle ne prend aucune place
 * (`-mb-14`) : au repos, elle se superpose au haut de la bannière.
 *
 * Son fond est toujours là — la même image que la bannière, floutée et sans
 * dégradé, sous un voile uni : jamais de barre transparente, au repos comme
 * au défilement. Une fois le titre de la page passé sous elle (`condensed`),
 * l'icône et le nom du monde y apparaissent. Le titre n'est que masqué
 * (opacité), pas démonté — la transition reste fluide.
 */
export function WorldHomeHeader({
  world,
  condensed,
  isFavorite,
  onToggleFavorite,
  onOpenSearch,
}: {
  world: Pick<World, "name" | "icon_url" | "visibility" | "banner_url" | "color">;
  /** Le titre de la page est passé sous la barre : nom du monde visible. */
  condensed: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpenSearch: () => void;
}) {
  const t = useTranslations("worlds");
  const tChat = useTranslations("chatrooms");
  const favoriteLabel = isFavorite ? t("hero.removeFavorite") : t("hero.addFavorite");

  return (
    // z-10 obligatoire : le bloc titre qui suit est `relative`, donc
    // positionné comme cette barre — à z-index égal, c'est le dernier du DOM
    // qui se peint au-dessus, et son `pt` (zone de padding captant les
    // événements pointeur) rendait les boutons inertes.
    <div
      data-world-home-header
      data-condensed={condensed || undefined}
      className="sticky top-0 z-10 -mb-14 h-14 shrink-0"
    >
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <WorldHeroCard world={world} blurred />
        {/* Voile uni (pas de dégradé) : le nom reste lisible sur une image claire. */}
        <div className="absolute inset-0 bg-black/35" />
      </div>

      <div className="relative flex h-full items-center gap-3 px-3">
        <MobileDrawerOpenButton className={BUTTON_CLASS} />
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 transition-opacity duration-200 motion-reduce:transition-none",
            condensed ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          aria-hidden={!condensed}
        >
          <WorldHomeIcon world={world} size={24} />
          <span className="truncate text-sm font-semibold text-white">{world.name}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={onOpenSearch} aria-label={tChat("search.title")} className={BUTTON_CLASS}>
                <Search size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>{tChat("search.title")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleFavorite}
                aria-label={favoriteLabel}
                className={cn(BUTTON_CLASS, isFavorite && "text-yellow-400")}
              >
                <Star size={16} className={isFavorite ? "fill-current" : ""} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>{favoriteLabel}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
