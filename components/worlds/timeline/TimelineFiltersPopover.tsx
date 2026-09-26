"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal } from "lucide-react";

import {
  NO_TIMELINE_FILTERS,
  TIMELINE_ITEM_KINDS,
  countActiveFilters,
  type TimelineFilters,
  type TimelineItemKind,
} from "@/lib/worldTimelineItems";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SUITE_STYLES, type SuiteStyle } from "@/components/worlds/timeline/SuiteLinks";

type Option = { id: string; label: string };

/**
 * Les filtres de la frise : quoi montrer (salons, événements, journaux), et,
 * pour les salons, un persona qui y a écrit, le joueur qui les a ouverts, un
 * arc, une catégorie. Un filtre sans choix possible (aucun arc…) ne s'affiche
 * pas.
 */
export function TimelineFiltersPopover({
  filters,
  onChange,
  showJournals,
  personas,
  players,
  arcs,
  categories,
  suiteStyle,
  onSuiteStyle,
  hoverOnly,
  onHoverOnly,
}: {
  filters: TimelineFilters;
  onChange: (next: TimelineFilters) => void;
  showJournals: boolean;
  personas: Option[];
  players: Option[];
  arcs: Option[];
  categories: Option[];
  suiteStyle: SuiteStyle;
  onSuiteStyle: (style: SuiteStyle) => void;
  hoverOnly: boolean;
  onHoverOnly: (on: boolean) => void;
}) {
  const t = useTranslations("worlds.timelineView");
  const active = countActiveFilters(filters);
  const kinds = TIMELINE_ITEM_KINDS.filter((k) => k !== "journal" || showJournals);

  function toggleKind(kind: TimelineItemKind, on: boolean) {
    const next = new Set(filters.kinds);
    if (on) next.add(kind);
    else next.delete(kind);
    onChange({ ...filters, kinds: next });
  }

  const selects: { key: "personaId" | "player" | "arcId" | "categoryId"; label: string; options: Option[] }[] = [
    { key: "personaId", label: t("filterPersona"), options: personas },
    { key: "player", label: t("filterPlayer"), options: players },
    { key: "arcId", label: t("filterArc"), options: arcs },
    { key: "categoryId", label: t("filterCategory"), options: categories },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t("filters")}
          {active > 0 && (
            <span className="rounded-full bg-foreground px-1.5 text-[10px] font-semibold leading-4 text-background" data-testid="timeline-filters-count">
              {active}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("filterShow")}</legend>
          {kinds.map((kind) => (
            <label key={kind} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={filters.kinds.has(kind)}
                onCheckedChange={(v) => toggleKind(kind, v === true)}
                aria-label={t(`kind.${kind}`)}
              />
              {t(`kind.${kind}`)}
            </label>
          ))}
        </fieldset>

        {selects.filter((s) => s.options.length > 0).map((s) => (
          <label key={s.key} className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
            <select
              value={filters[s.key] ?? ""}
              onChange={(e) => onChange({ ...filters, [s.key]: e.target.value || null })}
              className="h-8 w-full rounded-lg border border-border bg-transparent px-2 text-sm"
              aria-label={s.label}
            >
              <option value="">{t("filterAll")}</option>
              {s.options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
        ))}

        {/* Une préférence de lecture, gardée dans le navigateur. */}
        <label className="block space-y-1 border-t border-border pt-3">
          <span className="text-xs font-medium text-muted-foreground">{t("suiteStyle")}</span>
          <select
            value={suiteStyle}
            onChange={(e) => onSuiteStyle(e.target.value as SuiteStyle)}
            className="h-8 w-full rounded-lg border border-border bg-transparent px-2 text-sm"
            aria-label={t("suiteStyle")}
          >
            {SUITE_STYLES.map((s) => (
              <option key={s} value={s}>{t(`suiteStyles.${s}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={hoverOnly}
            onCheckedChange={(v) => onHoverOnly(v === true)}
            aria-label={t("suiteHoverOnly")}
          />
          {t("suiteHoverOnly")}
        </label>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("w-full", active === 0 && "invisible")}
          onClick={() => onChange({ ...NO_TIMELINE_FILTERS, query: filters.query })}
        >
          {t("filterReset")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
