"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CHANGELOG, groupByMonth, formatMonth, allTags } from "@/lib/changelog";
import type { ChangelogEntry } from "@/lib/changelog";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { cn } from "@/lib/utils";

const TAG_COLORS: Record<string, string> = {
  Personas:      "var(--color-brand-purple)",
  Chatrooms:     "var(--color-chain-cyan)",
  Mondes:        "var(--color-brand-green)",
  Interface:     "var(--color-chain-indigo)",
  Boutique:      "var(--color-brand-yellow)",
  Performance:   "var(--color-chain-teal)",
  Comptes:       "var(--color-chain-pink)",
  Admin:         "var(--color-chain-orange)",
  Correctif:     "var(--color-brand-red)",
  Technique:     "var(--color-chain-blue)",
  Mobile:        "var(--color-chain-mint)",
  Notifications: "var(--color-chain-gold)",
  Social:        "var(--color-chain-rose)",
};

function TagBadge({ tag }: { tag: string }) {
  const color = TAG_COLORS[tag];
  if (!color) {
    return (
      <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
        {tag}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        borderColor: `color-mix(in srgb, ${color} 22%, transparent)`,
      }}
    >
      {tag}
    </span>
  );
}

export function ChangelogFilters() {
  const tags = allTags(CHANGELOG);
  const [active, setActive] = useState<Set<string>>(new Set());

  function toggle(tag: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) { next.delete(tag); } else { next.add(tag); }
      return next;
    });
  }

  const filtered =
    active.size === 0
      ? CHANGELOG
      : CHANGELOG.filter((e) => active.has(e.tag));

  const grouped = groupByMonth(filtered);
  const months = [...grouped.keys()];

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
      {/* Filtre — rangée de puces scrollable sur mobile/écran réduit, sidebar sticky dès lg */}
      <div className="lg:hidden w-full -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {tags.map((tag) => {
            const color = TAG_COLORS[tag];
            const isActive = active.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggle(tag)}
                aria-pressed={isActive}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "border-foreground/20 bg-foreground/10 text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {color && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                )}
                {tag}
              </button>
            );
          })}
          {active.size > 0 && (
            <button
              type="button"
              onClick={() => setActive(new Set())}
              className="shrink-0 px-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 min-w-0 w-full space-y-10 sm:space-y-12">
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Aucune entrée pour ce filtre.
          </p>
        ) : (
          months.map((month) => {
            const entries = grouped.get(month)!;
            return (
              <div key={month} className="flex gap-3 sm:gap-6 items-start">
                {/* Date */}
                <div className="w-14 sm:w-24 shrink-0 pt-1">
                  <span className="text-xs sm:text-sm font-semibold capitalize text-foreground">
                    {formatMonth(month)}
                  </span>
                </div>

                {/* Ligne + point */}
                <div className="flex flex-col items-center self-stretch">
                  <div className="w-2 h-2 rounded-full bg-border shrink-0 mt-2" />
                  <div className="w-px flex-1 bg-border mt-1.5" />
                </div>

                {/* Entrées */}
                <div className="flex-1 min-w-0 space-y-2 pb-2">
                  {entries.map((entry, i) => (
                    <EntryRow key={i} entry={entry} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Filtre — sidebar sticky, dès lg */}
      <aside className="hidden lg:block w-48 shrink-0 sticky top-6 rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Filtrer
        </p>
        <div className="space-y-2">
          {tags.map((tag) => {
            const color = TAG_COLORS[tag];
            return (
              <div key={tag} className="flex items-center gap-2">
                <Checkbox
                  id={`filter-${tag}`}
                  checked={active.has(tag)}
                  onCheckedChange={() => toggle(tag)}
                />
                {color && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                )}
                <Label
                  htmlFor={`filter-${tag}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {tag}
                </Label>
              </div>
            );
          })}
        </div>
        {active.size > 0 && (
          <button
            onClick={() => setActive(new Set())}
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
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 px-3 py-3 sm:px-4 flex flex-col sm:flex-row gap-2 sm:gap-4 items-start">
      <div className="sm:w-24 shrink-0 sm:pt-0.5">
        <TagBadge tag={entry.tag} />
      </div>
      <MarkdownRenderer content={entry.text} className="gap-1 text-sm leading-relaxed" />
    </div>
  );
}
