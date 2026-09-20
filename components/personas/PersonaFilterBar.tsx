"use client";

import { useTranslations } from "next-intl";
import { ArrowUpDown, Check, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { NARRATIVE_STATUSES } from "@/lib/personaStatus";
import type { PersonaSheetBadgeKind } from "@/lib/personaReview";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PERSONA_FILTER_ALL as ALL, PERSONA_FILTER_NO_GROUP as NO_GROUP, SHEET_FILTERS, type PersonaFilters, type PersonaSortKey } from "./personaFilters";

type Option = { value: string; label: string; color?: string };

/** Les deux boutons prennent la forme du champ de recherche : même hauteur, mêmes coins. */
const TRIGGER_CLASS = "h-9 shrink-0 gap-1.5 rounded-lg px-3";

/** Une dimension du filtre : son nom, ses valeurs, celle qui est active. */
type Dimension = { key: keyof Omit<PersonaFilters, "query" | "reviewActive">; label: string; allLabel: string; options: Option[] };

/**
 * La barre de la liste des personas : la recherche, un seul menu « Filtres »
 * (une entrée par dimension, la valeur courante en regard, les choix dans un
 * sous-menu) et le tri. Les filtres actifs se lisent en pastilles, chacune
 * retirable — le menu, lui, reste court.
 */
export function PersonaFilterBar({
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  players,
  groups,
  showKind,
  reviewActive,
}: {
  filters: PersonaFilters;
  onFiltersChange: (next: PersonaFilters) => void;
  sort: PersonaSortKey;
  onSortChange: (next: PersonaSortKey) => void;
  players: { id: string; label: string }[];
  groups: { id: string; name: string; color: string }[];
  /** Le monde a des PNJ (ou l'utilisateur en gère) : le type se filtre. */
  showKind: boolean;
  /** Le monde relit ses fiches : les états de relecture se filtrent. */
  reviewActive: boolean;
}) {
  const t = useTranslations("personas.list");
  const tStatus = useTranslations("personas.narrativeStatus");
  const tSheet = useTranslations("personas.sheet");
  const tNpc = useTranslations("personas.npc");

  const dimensions: Dimension[] = [
    ...(players.length > 1
      ? [{ key: "player" as const, label: t("filterPlayer"), allLabel: t("allPlayers"), options: players.map((p) => ({ value: p.id, label: p.label })) }]
      : []),
    ...(groups.length > 0
      ? [{
          key: "group" as const, label: t("filterGroup"), allLabel: t("allGroups"),
          options: [...groups.map((g) => ({ value: g.id, label: g.name, color: g.color })), { value: NO_GROUP, label: t("noGroup") }],
        }]
      : []),
    { key: "status" as const, label: t("filterStatus"), allLabel: t("allStatuses"), options: NARRATIVE_STATUSES.map((s) => ({ value: s, label: tStatus(s) })) },
    ...(showKind
      ? [{ key: "kind" as const, label: tNpc("filterKind"), allLabel: tNpc("allKinds"), options: [{ value: "player", label: tNpc("kindPlayers") }, { value: "npc", label: tNpc("kindNpcs") }] }]
      : []),
    {
      key: "sheet" as const, label: t("filterSheet"), allLabel: t("allSheets"),
      options: (reviewActive ? SHEET_FILTERS : SHEET_FILTERS.filter((k) => k === "incomplete")).map((k: PersonaSheetBadgeKind) => ({ value: k, label: tSheet(k) })),
    },
  ];

  const active = dimensions.filter((d) => filters[d.key] !== ALL);
  const labelOf = (d: Dimension) => d.options.find((o) => o.value === filters[d.key])?.label ?? d.allLabel;
  const set = (key: Dimension["key"], value: string) => onFiltersChange({ ...filters, [key]: value });
  const reset = () => onFiltersChange({ ...filters, player: ALL, group: ALL, status: ALL, kind: ALL, sheet: ALL });
  const sortLabel: Record<PersonaSortKey, string> = { name: t("sortName"), newest: t("sortNewest"), oldest: t("sortOldest") };

  return (
    <div className="space-y-2" role="search">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={filters.query}
            onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="pl-9"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className={cn(TRIGGER_CLASS, active.length > 0 && "border-primary/50")} aria-label={t("filters")}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("filters")}</span>
              {active.length > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums" data-testid="active-filter-count">
                  {active.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t("filters")}</DropdownMenuLabel>
            {dimensions.map((d) => (
              <DropdownMenuSub key={d.key}>
                <DropdownMenuSubTrigger className="gap-3">
                  <span className="flex-1">{d.label}</span>
                  <span className={cn("truncate text-xs", filters[d.key] === ALL ? "text-muted-foreground" : "font-medium text-primary")}>{labelOf(d)}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="min-w-44 max-h-80 overflow-y-auto">
                    <DropdownMenuRadioGroup value={filters[d.key]} onValueChange={(v) => set(d.key, v)}>
                      <DropdownMenuRadioItem value={ALL}>{d.allLabel}</DropdownMenuRadioItem>
                      <DropdownMenuSeparator />
                      {d.options.map((o) => (
                        <DropdownMenuRadioItem key={o.value} value={o.value}>
                          {o.color && <span aria-hidden className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: o.color }} />}
                          {o.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            ))}
            {active.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={reset}>
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                  {t("resetFilters")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className={TRIGGER_CLASS} aria-label={t("sort")} title={sortLabel[sort]}>
              <ArrowUpDown className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{sortLabel[sort]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onSortChange(v as PersonaSortKey)}>
              {(["name", "newest", "oldest"] as PersonaSortKey[]).map((k) => (
                <DropdownMenuRadioItem key={k} value={k}>{sortLabel[k]}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="active-filters">
          {active.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => set(d.key, ALL)}
              aria-label={t("removeFilter", { filter: d.label, value: labelOf(d) })}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 pl-2.5 pr-1.5 py-0.5 text-xs text-foreground transition-colors hover:bg-primary/15"
            >
              <Check className="h-3 w-3 text-primary" aria-hidden />
              <span className="text-muted-foreground">{d.label} ·</span>
              <span className="font-medium">{labelOf(d)}</span>
              <X className="h-3 w-3 text-muted-foreground" aria-hidden />
            </button>
          ))}
          <button type="button" onClick={reset} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            {t("resetFilters")}
          </button>
        </div>
      )}
    </div>
  );
}
