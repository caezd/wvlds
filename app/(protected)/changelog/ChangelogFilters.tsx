"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  CHANGELOG,
  groupByMonth,
  formatMonth,
  formatDay,
  categoryTree,
  matchesFilter,
} from "@/lib/changelog";
import type {
  ChangelogArea,
  ChangelogCategory,
  ChangelogEntry,
  ChangelogFilter,
} from "@/lib/changelog";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { cn } from "@/lib/utils";

/** Une teinte par catégorie, choisies pour rester distinctes l'une de l'autre. */
const CATEGORY_COLORS: Record<ChangelogCategory, string> = {
  Fonctionnalité: "var(--color-brand-green)",
  Interface:      "var(--color-brand-purple)",
  Correctif:      "var(--color-brand-red)",
  Performance:    "var(--color-chain-amber)",
  Technique:      "var(--color-chain-blue)",
};

/** Texte teinté mêlé à la couleur du texte : lisible sur fond clair comme sombre. */
const tintedText = (color: string) => `color-mix(in oklab, ${color} 70%, var(--foreground))`;

function CategoryBadge({ category }: { category: ChangelogCategory }) {
  const color = CATEGORY_COLORS[category];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-px text-[11px] font-medium whitespace-nowrap"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        color: tintedText(color),
        borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {category}
    </span>
  );
}

function Dot({ category }: { category: ChangelogCategory }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0"
      style={{ backgroundColor: CATEGORY_COLORS[category] }}
    />
  );
}

const chipClass = (isActive: boolean) =>
  cn(
    "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
    isActive
      ? "border-foreground/20 bg-foreground/10 text-foreground"
      : "border-border text-muted-foreground",
  );

export function ChangelogFilters() {
  const tree = categoryTree(CHANGELOG);
  const [filter, setFilter] = useState<ChangelogFilter>(new Map());

  function toggleCategory(category: ChangelogCategory) {
    setFilter((prev) => {
      const next = new Map(prev);
      if (next.has(category)) { next.delete(category); } else { next.set(category, new Set()); }
      return next;
    });
  }

  function toggleArea(category: ChangelogCategory, area: ChangelogArea) {
    setFilter((prev) => {
      const next = new Map(prev);
      const areas = new Set(next.get(category));
      if (areas.has(area)) { areas.delete(area); } else { areas.add(area); }
      next.set(category, areas);
      return next;
    });
  }

  const reset = () => setFilter(new Map());

  const grouped = groupByMonth(CHANGELOG.filter((e) => matchesFilter(e, filter)));
  const months = [...grouped.keys()];

  // Sous-catégories proposées sur mobile : celles des catégories cochées.
  const activeBranches = tree.filter((b) => filter.has(b.category) && b.areas.length > 0);

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
      {/* Filtre — rangées de puces scrollables sur mobile/écran réduit, sidebar sticky dès lg */}
      <div className="lg:hidden w-full -mx-4 px-4 sm:mx-0 sm:px-0 space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {tree.map(({ category }) => (
            <button
              key={category}
              type="button"
              onClick={() => toggleCategory(category)}
              aria-pressed={filter.has(category)}
              className={chipClass(filter.has(category))}
            >
              <Dot category={category} />
              {category}
            </button>
          ))}
          {filter.size > 0 && (
            <button
              type="button"
              onClick={reset}
              className="shrink-0 px-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Réinitialiser
            </button>
          )}
        </div>
        {activeBranches.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {activeBranches.flatMap(({ category, areas }) =>
              areas.map((area) => {
                const isActive = filter.get(category)?.has(area) ?? false;
                return (
                  <button
                    key={`${category}/${area}`}
                    type="button"
                    onClick={() => toggleArea(category, area)}
                    aria-pressed={isActive}
                    aria-label={`${category} › ${area}`}
                    className={chipClass(isActive)}
                  >
                    <Dot category={category} />
                    {area}
                  </button>
                );
              }),
            )}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 min-w-0 w-full">
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Aucune entrée pour ce filtre.
          </p>
        ) : (
          months.map((month) => {
            const entries = grouped.get(month)!;
            return (
              <section
                key={month}
                aria-labelledby={`month-${month}`}
                className="flex gap-3 sm:gap-5 items-start"
              >
                {/* Mois, collé en haut pendant le défilement de ses entrées */}
                <div className="w-16 sm:w-24 shrink-0 pt-3 sticky top-0">
                  <h2
                    id={`month-${month}`}
                    className="text-xs sm:text-sm font-semibold capitalize leading-tight"
                  >
                    {formatMonth(month)}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {entries.length} {entries.length > 1 ? "entrées" : "entrée"}
                  </p>
                </div>

                {/* Ligne + point */}
                <div className="flex flex-col items-center self-stretch" aria-hidden="true">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0 mt-4" />
                  <div className="w-px flex-1 bg-border mt-1.5" />
                </div>

                <ul className="flex-1 min-w-0 divide-y divide-border/60 pb-6">
                  {entries.map((entry, i) => (
                    <EntryRow key={i} entry={entry} />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>

      {/* Filtre — sidebar sticky, dès lg */}
      <aside className="hidden lg:block w-52 shrink-0 sticky top-6 rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Filtrer
        </p>
        <div className="space-y-2">
          {tree.map(({ category, areas }) => {
            const selected = filter.get(category);
            return (
              <div key={category} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`filter-${category}`}
                    checked={selected !== undefined}
                    onCheckedChange={() => toggleCategory(category)}
                  />
                  <Dot category={category} />
                  <Label
                    htmlFor={`filter-${category}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {category}
                  </Label>
                </div>
                {selected !== undefined && areas.length > 0 && (
                  <div className="ml-6 pl-2 border-l border-border space-y-1.5">
                    {areas.map((area) => (
                      <div key={area} className="flex items-center gap-2">
                        <Checkbox
                          id={`filter-${category}-${area}`}
                          checked={selected.has(area)}
                          onCheckedChange={() => toggleArea(category, area)}
                        />
                        <Label
                          htmlFor={`filter-${category}-${area}`}
                          className="text-xs font-normal text-muted-foreground cursor-pointer"
                        >
                          {area}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {filter.size > 0 && (
          <button
            onClick={reset}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Réinitialiser
          </button>
        )}
      </aside>
    </div>
  );
}

function EntryRow({ entry }: { entry: ChangelogEntry }) {
  const day = formatDay(entry.date);
  return (
    <li className="py-3 space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <CategoryBadge category={entry.category} />
        {entry.area && <span>{entry.area}</span>}
        {day && (
          <time dateTime={entry.date} className="ml-auto tabular-nums">
            {day}
          </time>
        )}
      </div>
      <MarkdownRenderer content={entry.text} className="gap-1 text-sm leading-relaxed" />
    </li>
  );
}
