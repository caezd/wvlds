"use client";

import type * as React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Eye, EyeOff, Ghost } from "lucide-react";
import { SectionLabel } from "@/components/ui/section-label";
import type { CGroup, CRelType } from "./types";

/** L'échantillon du trait d'un type : sa couleur et ses tirets. */
export function TypeStroke({ type, width = 20, off = false }: { type: Pick<CRelType, "color" | "dash">; width?: number; off?: boolean }) {
  return (
    <svg width={width + 2} height="8" aria-hidden className={cn("shrink-0", off && "opacity-30")}>
      <line x1="1" y1="4" x2={width + 1} y2="4" stroke={type.color} strokeWidth={2} strokeLinecap="round" strokeDasharray={type.dash || undefined} />
    </svg>
  );
}

/**
 * La section « Types » du panneau du canevas, sur grand écran : une ligne
 * par type (trait, nom, nombre de relations, œil). Un clic masque ou
 * réaffiche ses relations ; « tout afficher » n'apparaît que s'il y a
 * quelque chose à rétablir.
 */
export function RelationTypeFilter({
  relTypes,
  typeCounts,
  hiddenTypes,
  onToggleType,
  onShowAll,
}: {
  relTypes: CRelType[];
  typeCounts: ReadonlyMap<string, number>;
  hiddenTypes: ReadonlySet<string>;
  onToggleType: (id: string) => void;
  onShowAll: () => void;
}) {
  const t = useTranslations("relations");
  return (
    <section className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-2 pb-1.5">
        <SectionLabel as="h3">{t("relTypes")}</SectionLabel>
        {hiddenTypes.size > 0 && (
          <button type="button" onClick={onShowAll} className="text-xs-plus text-muted-foreground underline underline-offset-[3px] hover:text-foreground">
            {t("showAll")}
          </button>
        )}
      </div>
      {relTypes.length === 0 && <p className="px-2 text-xs text-muted-foreground">{t("noTypesDefined")}</p>}
      {relTypes.map((tp) => {
        const off = hiddenTypes.has(tp.id);
        const label = off ? t("showType", { name: tp.name }) : t("hideType", { name: tp.name });
        const Icon = off ? EyeOff : Eye;
        return (
          <button
            key={tp.id}
            type="button"
            aria-pressed={!off}
            aria-label={label}
            title={label}
            onClick={() => onToggleType(tp.id)}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted",
              off ? "text-muted-foreground" : "text-foreground",
            )}
          >
            <TypeStroke type={tp} off={off} />
            <span className={cn("min-w-0 flex-1 truncate", off && "line-through")}>
              {tp.name}
              {tp.mutual && <span aria-hidden className="text-muted-foreground"> ⇄</span>}
            </span>
            <span className="text-xs-plus tabular-nums text-muted-foreground">{typeCounts.get(tp.id) ?? 0}</span>
            <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        );
      })}
    </section>
  );
}

/** Un élément de la légende : un bouton bas, sans bordure. */
const ITEM = "flex h-[26px] shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors hover:bg-muted";

/**
 * La légende de la liste mobile — et son filtre.
 *
 * Chaque type et chaque groupe est un bouton : éteint, les relations de ce
 * type ne se dessinent plus, les personas hors de ce groupe s'effacent. Sur
 * un monde fourni, c'est la seule façon de lire une relation à la fois. Un
 * filtre vide (rien d'éteint) montre tout ; « tout afficher » n'apparaît que
 * lorsqu'il y a quelque chose à rétablir.
 *
 * Une seule barre, qui défile de côté sans barre visible quand elle déborde.
 */
export function RelationsLegend({
  relTypes,
  typeCounts,
  groups,
  hiddenTypes,
  hiddenGroups,
  onToggleType,
  onToggleGroup,
  hideRetired,
  onToggleRetired,
  onReset,
  className,
  style,
}: {
  relTypes: CRelType[];
  /** Nombre de relations de chaque type, affiché après son nom. */
  typeCounts?: ReadonlyMap<string, number>;
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
  style?: React.CSSProperties;
}) {
  const t = useTranslations("relations");
  const filtering = hiddenTypes.size > 0 || hiddenGroups.size > 0 || hideRetired === true;
  const separator = <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-input" />;

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 overflow-x-auto whitespace-nowrap rounded-xl border border-border bg-background/90 p-1 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
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
            className={cn(ITEM, off ? "text-muted-foreground line-through" : "text-foreground")}
          >
            <svg width="20" height="8" aria-hidden className={cn(off && "opacity-30")}>
              <line x1="1" y1="4" x2="19" y2="4" stroke={tp.color} strokeWidth={2} strokeLinecap="round" strokeDasharray={tp.dash || undefined} />
            </svg>
            {tp.name}
            {tp.mutual && <span aria-hidden className="text-muted-foreground">⇄</span>}
            {typeCounts && <span className="text-2xs tabular-nums text-muted-foreground">{typeCounts.get(tp.id) ?? 0}</span>}
          </button>
        );
      })}
      {groups.length > 0 && relTypes.length > 0 && separator}
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
            className={cn(ITEM, off ? "text-muted-foreground line-through" : "text-foreground")}
          >
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", off && "opacity-30")} style={{ boxShadow: `inset 0 0 0 2px ${g.color}` }} />
            {g.name}
          </button>
        );
      })}
      {hideRetired !== undefined && onToggleRetired && (
        <>
          {(groups.length > 0 || relTypes.length > 0) && separator}
          <button
            type="button"
            aria-pressed={hideRetired}
            onClick={onToggleRetired}
            className={cn(ITEM, hideRetired ? "bg-muted text-foreground" : "text-muted-foreground")}
          >
            <Ghost className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {hideRetired ? t("showRetired") : t("hideRetired")}
          </button>
        </>
      )}
      {filtering && (
        <button type="button" onClick={onReset} className={cn(ITEM, "text-muted-foreground underline underline-offset-[3px] hover:bg-transparent hover:text-foreground")}>
          {t("showAll")}
        </button>
      )}
    </div>
  );
}
