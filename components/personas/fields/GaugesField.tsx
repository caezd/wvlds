"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

import type { GaugeItem } from "@/types/personas";
import { makeItemId } from "./shared";

export function GaugesField({
  initialItems,
  onSave,
}: {
  initialItems: GaugeItem[];
  onSave: (items: GaugeItem[]) => void;
}) {
  const tCommon = useTranslations("common");
  const tPersonas = useTranslations("personas");
  const [items, setItems] = useState<GaugeItem[]>(initialItems);

  function update(next: GaugeItem[]) { setItems(next); onSave(next); }
  function patch(id: string, key: keyof GaugeItem, val: string | number) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }
  function addItem() {
    update([...items, { id: makeItemId(), name: "", value: 0, max: 100, color: "#6366f1" }]);
  }
  function removeItem(id: string) { update(items.filter((it) => it.id !== id)); }

  return (
    <div className="space-y-3 pr-24">
      {items.map((item) => {
        const pct = Math.min(100, ((item.value ?? 0) / (item.max || 1)) * 100);
        return (
          <div key={item.id} className="group/gauge space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                value={item.name}
                onChange={(e) => patch(item.id, "name", e.target.value)}
                placeholder={tPersonas("gaugeNamePlaceholder")}
                className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40"
              />
              <div className="flex items-center gap-1.5 shrink-0 text-sm tabular-nums text-muted-foreground">
                <input
                  type="number"
                  min={0}
                  value={item.value}
                  onChange={(e) => patch(item.id, "value", Number(e.target.value))}
                  className="w-12 bg-transparent text-right outline-none"
                />
                <span>/</span>
                <input
                  type="number"
                  min={1}
                  value={item.max}
                  onChange={(e) => patch(item.id, "max", Math.max(1, Number(e.target.value)))}
                  className="w-12 bg-transparent outline-none"
                />
                <input
                  type="color"
                  value={item.color}
                  onChange={(e) => patch(item.id, "color", e.target.value)}
                  className="h-6 w-6 shrink-0 cursor-pointer rounded border-none bg-transparent p-0"
                  title="Couleur"
                />
                <button
                  aria-label={tCommon("remove")}
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/gauge:opacity-100 hover:text-destructive transition-opacity"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: item.color }}
              />
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter une jauge
      </button>
    </div>
  );
}
