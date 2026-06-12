"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CHANGELOG, groupByMonth, formatMonth, allTags } from "@/lib/changelog";
import type { ChangelogEntry } from "@/lib/changelog";

function TagBadge({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
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
      next.has(tag) ? next.delete(tag) : next.add(tag);
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
    <div className="flex gap-8 items-start">
      {/* Timeline */}
      <div className="flex-1 min-w-0 space-y-10">
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Aucune entrée pour ce filtre.
          </p>
        ) : (
          months.map((month) => {
            const entries = grouped.get(month)!;
            return (
              <div key={month} className="flex gap-6 items-start">
                {/* Date */}
                <div className="w-24 shrink-0 pt-0.5">
                  <span className="text-sm font-medium capitalize text-foreground">
                    {formatMonth(month)}
                  </span>
                </div>

                {/* Séparateur vertical */}
                <div className="flex flex-col items-center self-stretch">
                  <div className="w-px flex-1 bg-border" />
                </div>

                {/* Entrées */}
                <div className="flex-1 min-w-0 space-y-5 pb-2">
                  {entries.map((entry, i) => (
                    <EntryRow key={i} entry={entry} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Filtre */}
      <aside className="w-48 shrink-0 sticky top-6 rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Filtrer
        </p>
        <div className="space-y-2">
          {tags.map((tag) => (
            <div key={tag} className="flex items-center gap-2">
              <Checkbox
                id={`filter-${tag}`}
                checked={active.has(tag)}
                onCheckedChange={() => toggle(tag)}
              />
              <Label
                htmlFor={`filter-${tag}`}
                className="text-sm font-normal cursor-pointer"
              >
                {tag}
              </Label>
            </div>
          ))}
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
    <div className="flex gap-4 items-start">
      <div className="w-28 shrink-0 pt-0.5">
        <TagBadge tag={entry.tag} />
      </div>
      <p className="text-sm text-foreground leading-relaxed">{entry.text}</p>
    </div>
  );
}
