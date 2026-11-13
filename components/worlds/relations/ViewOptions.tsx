"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { RingGroupBy } from "./ringGrouping";

/**
 * Réglages d'affichage du plateau, en haut à gauche : le découpage (par joueur
 * ou par groupe) et le masquage des personas sans relation pour les vues
 * d'ensemble ; le second anneau pour la vue Centré, organisée autour d'un
 * persona et non par joueur ou par groupe.
 */
export function ViewOptions({
  focusMode,
  groupBy,
  canGroup,
  onGroupBy,
  hideIsolated,
  onHideIsolated,
  showSecondRing,
  onShowSecondRing,
}: {
  focusMode: boolean;
  groupBy: RingGroupBy;
  /** Faux sans aucun groupe défini dans le monde. */
  canGroup: boolean;
  onGroupBy: (value: RingGroupBy) => void;
  hideIsolated: boolean;
  onHideIsolated: (value: boolean) => void;
  showSecondRing: boolean;
  onShowSecondRing: (value: boolean) => void;
}) {
  const t = useTranslations("relations");
  const segment = (on: boolean) =>
    cn(
      "h-7 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
      on ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div
      data-testid="relations-view-options"
      className="absolute left-4 top-3 z-10 flex cursor-default flex-wrap items-center gap-1 rounded-lg border border-border bg-background/90 p-[3px]"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {focusMode ? (
        <button type="button" aria-pressed={showSecondRing} onClick={() => onShowSecondRing(!showSecondRing)} className={segment(showSecondRing)}>
          {t("secondRing")}
        </button>
      ) : (
        <>
          <div role="radiogroup" aria-label={t("groupBy")} className="flex items-center gap-0.5">
            <button type="button" role="radio" aria-checked={groupBy === "player"} onClick={() => onGroupBy("player")} className={segment(groupBy === "player")}>
              {t("groupByPlayer")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={groupBy === "group"}
              disabled={!canGroup}
              title={canGroup ? undefined : t("noGroupsDefined")}
              onClick={() => onGroupBy("group")}
              className={segment(groupBy === "group")}
            >
              {t("groupByGroup")}
            </button>
          </div>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
          <button type="button" aria-pressed={hideIsolated} onClick={() => onHideIsolated(!hideIsolated)} className={segment(hideIsolated)}>
            {t("hideIsolated")}
          </button>
        </>
      )}
    </div>
  );
}
