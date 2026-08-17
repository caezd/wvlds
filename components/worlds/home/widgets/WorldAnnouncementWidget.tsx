"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Pencil, Plus } from "lucide-react";

export type AnnouncementSize = "sm" | "md" | "lg";

/** Hauteur de l'iframe par taille — pas d'auto-resize possible sans script
 *  (postMessage exige allow-scripts, qu'on refuse volontairement). */
const SIZE_HEIGHT: Record<AnnouncementSize, number> = {
  sm: 160,
  md: 280,
  lg: 420,
};

/**
 * Widget d'affichage pur — l'édition se fait dans Réglages > Page d'accueil
 * (WorldAnnouncementSettings), pas ici. Rendu dans une iframe sandboxée :
 * sandbox="" (aucun token, notamment pas allow-scripts) interdit au
 * navigateur toute exécution de script à l'intérieur, quel que soit le
 * contenu — c'est cette garantie du navigateur, pas un filtrage de balises,
 * qui rend sûr le HTML/CSS libre saisi par un admin.
 */
export function WorldAnnouncementWidget({
  worldId,
  canAdmin,
  html,
  size,
}: {
  worldId: string;
  canAdmin: boolean;
  html: string | null;
  size: AnnouncementSize;
}) {
  const t = useTranslations("worlds");
  const settingsHref = `/w/${worldId}?view=settings`;

  if (!html) {
    if (!canAdmin) return null;
    return (
      <Link
        href={settingsHref}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        {t("home.announcement.add")}
      </Link>
    );
  }

  return (
    <div className="group relative">
      <iframe
        sandbox=""
        srcDoc={html}
        title={t("home.announcement.dialogTitle")}
        style={{ height: SIZE_HEIGHT[size] }}
        className="w-full rounded-lg border bg-background"
      />
      {canAdmin && (
        <Link
          href={settingsHref}
          aria-label={t("home.announcement.edit")}
          className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-background/90 text-muted-foreground opacity-0 shadow transition-opacity hover:bg-hoverCard hover:text-foreground group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
