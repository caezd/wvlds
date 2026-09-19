"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Ghost } from "lucide-react";
import { REL_W } from "./geometry";
import type { CGroup, CRelType } from "./types";

/**
 * La légende du canevas — et son filtre.
 *
 * Chaque type et chaque groupe est un bouton : éteint, les relations de ce
 * type ne se dessinent plus, les personas hors de ce groupe s'effacent. Sur
 * un monde fourni, c'est la seule façon de lire une relation à la fois. Un
 * filtre vide (rien d'éteint) montre tout ; « tout afficher » n'apparaît que
 * lorsqu'il y a quelque chose à rétablir.
 */
export function RelationsLegend({
  relTypes,
  groups,
  hiddenTypes,
  hiddenGroups,
  onToggleType,
  onToggleGroup,
  hideRetired,
  onToggleRetired,
  onReset,
  className,
}: {
  relTypes: CRelType[];
  groups: CGroup[];
  hiddenTypes: ReadonlySet<string>;
  hiddenGroups: ReadonlySet<string>;
  onToggleType: (id: string) => void;
  onToggleGroup: (id: string) => void;
  /** `undefined` : aucun persona décédé ou retiré dans le monde, pas de bouton. */
  hideRetired?: boolean;
  onToggleRetired?: () => void;
  onReset: () => void;
  className?: string;
}) {
  const t = useTranslations("relations");
  const filtering = hiddenTypes.size > 0 || hiddenGroups.size > 0 || hideRetired === true;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
      {relTypes.map((tp) => {
        const off = hiddenTypes.has(tp.id);
        return (
          <button
            key={tp.id}
            type="button"
            aria-pressed={!off}
            onClick={() => onToggleType(tp.id)}
            aria-label={off ? t("showType", { name: tp.name }) : t("hideType", { name: tp.name })}
            title={off ? t("showType", { name: tp.name }) : t("hideType", { name: tp.name })}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[11px] transition-opacity hover:bg-muted/60",
              off ? "text-muted-foreground/50 line-through" : "text-muted-foreground",
            )}
          >
            <svg width="22" height="8" aria-hidden className={cn(off && "opacity-30")}>
              <line x1="0" y1="4" x2="22" y2="4" stroke={tp.color} strokeWidth={REL_W} strokeDasharray={tp.dash || undefined} />
            </svg>
            {tp.name}
            {tp.mutual && <span aria-hidden className="text-muted-foreground/60">⇄</span>}
          </button>
        );
      })}
      {groups.length > 0 && relTypes.length > 0 && <span aria-hidden className="h-3 w-px bg-border" />}
      {groups.map((g) => {
        const off = hiddenGroups.has(g.id);
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={!off}
            onClick={() => onToggleGroup(g.id)}
            aria-label={off ? t("showGroup", { name: g.name }) : t("hideGroup", { name: g.name })}
            title={off ? t("showGroup", { name: g.name }) : t("hideGroup", { name: g.name })}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[11px] transition-opacity hover:bg-muted/60",
              off ? "text-muted-foreground/50 line-through" : "text-muted-foreground",
            )}
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", off && "opacity-30")} style={{ background: g.color }} />
            {g.name}
          </button>
        );
      })}
      {hideRetired !== undefined && onToggleRetired && (
        <>
          {(groups.length > 0 || relTypes.length > 0) && <span aria-hidden className="h-3 w-px bg-border" />}
          <button
            type="button"
            aria-pressed={hideRetired}
            onClick={onToggleRetired}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[11px] transition-opacity hover:bg-muted/60",
              hideRetired ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Ghost className="h-3 w-3 shrink-0" aria-hidden />
            {hideRetired ? t("showRetired") : t("hideRetired")}
          </button>
        </>
      )}
      {filtering && (
        <button type="button" onClick={onReset} className="ml-auto text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
          {t("showAll")}
        </button>
      )}
    </div>
  );
}
