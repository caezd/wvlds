"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

import type { TraitItem } from "@/types/personas";
import { makeItemId } from "./shared";

export function TraitsField({
  initialItems,
  onSave,
}: {
  initialItems: TraitItem[];
  onSave: (items: TraitItem[]) => void;
}) {
  const tCommon = useTranslations("common");
  const [items, setItems] = useState<TraitItem[]>(initialItems);

  function update(next: TraitItem[]) { setItems(next); onSave(next); }
  function patchLabel(id: string, label: string) {
    update(items.map((it) => (it.id === id ? { ...it, label } : it)));
  }
  function removeItem(id: string) { update(items.filter((it) => it.id !== id)); }
  function addItem() { update([...items, { id: makeItemId(), label: "" }]); }

  return (
    <div className="flex flex-wrap gap-2 pr-24">
      {items.map((item) => (
        <div
          key={item.id}
          className="group/trait flex items-center gap-1 rounded-full border border-border-soft bg-muted/40 px-2.5 py-1"
        >
          <input
            value={item.label}
            onChange={(e) => patchLabel(item.id, e.target.value)}
            placeholder="Trait…"
            size={Math.max(4, item.label.length + 1)}
            className="bg-transparent text-xs font-medium outline-none placeholder:text-muted-foreground/40 min-w-[4rem]"
          />
          <button
            aria-label={tCommon("remove")}
            type="button"
            onClick={() => removeItem(item.id)}
            className="shrink-0 text-muted-foreground opacity-0 group-hover/trait:opacity-100 hover:text-destructive transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1 rounded-full border border-dashed border-border-soft px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="h-3 w-3" /> Trait
      </button>
    </div>
  );
}
