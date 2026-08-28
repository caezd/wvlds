"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

import type { PersonaStat } from "@/types/personas";
import { makeItemId } from "./shared";

export function StatsField({
  initialItems,
  onSave,
}: {
  initialItems: PersonaStat[];
  onSave: (items: PersonaStat[]) => void;
}) {
  const tPersonas = useTranslations("personas");
  const [items, setItems] = useState<PersonaStat[]>(initialItems);

  function update(next: PersonaStat[]) {
    setItems(next);
    onSave(next);
  }

  function patch(id: string, key: keyof PersonaStat, val: string) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }

  function addStat() {
    update([...items, { id: makeItemId(), label: "", value: "", unit: "" }]);
  }

  function removeStat(id: string) {
    update(items.filter((it) => it.id !== id));
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
      {items.map((stat) => (
        <div
          key={stat.id}
          className="group/stat relative flex flex-col gap-1 rounded-lg border border-border-soft bg-muted/30 px-3 py-2"
        >
          <button
            type="button"
            onClick={() => removeStat(stat.id)}
            className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover/stat:flex"
            aria-label={tPersonas("deleteStat")}
          >
            <X className="h-2.5 w-2.5" />
          </button>
          <input
            value={stat.label}
            onChange={(e) => patch(stat.id, "label", e.target.value)}
            placeholder="AGI"
            className="w-full bg-transparent text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground outline-none placeholder:text-muted-foreground/40"
          />
          <div className="flex items-baseline gap-1">
            <input
              value={stat.value}
              onChange={(e) => patch(stat.id, "value", e.target.value)}
              placeholder="10"
              className="min-w-0 flex-1 bg-transparent text-lg font-semibold tabular-nums outline-none placeholder:text-muted-foreground/40"
            />
            <input
              value={stat.unit ?? ""}
              onChange={(e) => patch(stat.id, "unit", e.target.value)}
              placeholder="cm"
              className="w-8 shrink-0 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addStat}
        className="flex min-h-[3.75rem] items-center justify-center gap-1 rounded-lg border border-dashed border-border-soft text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> Stat
      </button>
    </div>
  );
}
