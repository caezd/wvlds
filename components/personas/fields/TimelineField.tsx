"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

import type { TimelineItem } from "@/types/personas";
import { makeItemId } from "./shared";

export function TimelineField({
  initialItems,
  onSave,
}: {
  initialItems: TimelineItem[];
  onSave: (items: TimelineItem[]) => void;
}) {
  const tCommon = useTranslations("common");
  const tPersonas = useTranslations("personas");
  const [items, setItems] = useState<TimelineItem[]>(initialItems);

  function update(next: TimelineItem[]) { setItems(next); onSave(next); }
  function patch(id: string, key: keyof TimelineItem, val: string) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }
  function addItem() {
    update([...items, { id: makeItemId(), date: "", title: "", description: "" }]);
  }
  function removeItem(id: string) { update(items.filter((it) => it.id !== id)); }

  return (
    <div className="space-y-0 pr-24">
      {items.map((item, i) => (
        <div key={item.id} className="flex gap-3 group/event">
          <div className="flex flex-col items-center">
            <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-border" />
            {i < items.length - 1 && <div className="flex-1 w-px bg-border mt-1" />}
          </div>
          <div className="flex-1 space-y-1 pb-4 min-w-0">
            <div className="flex items-center gap-2">
              <input
                value={item.date ?? ""}
                onChange={(e) => patch(item.id, "date", e.target.value)}
                placeholder={tPersonas("eraPlaceholder")}
                className="w-24 shrink-0 bg-transparent text-[0.65rem] text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              />
              <input
                value={item.title}
                onChange={(e) => patch(item.id, "title", e.target.value)}
                placeholder={tPersonas("eventTitlePlaceholder")}
                className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40"
              />
              <button
                aria-label={tCommon("remove")}
                type="button"
                onClick={() => removeItem(item.id)}
                className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/event:opacity-100 hover:text-destructive transition-opacity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              value={item.description ?? ""}
              onChange={(e) => patch(item.id, "description", e.target.value)}
              placeholder="Description (optionnel)"
              rows={2}
              className="w-full bg-transparent text-xs text-muted-foreground outline-none resize-none placeholder:text-muted-foreground/40 leading-relaxed"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter un événement
      </button>
    </div>
  );
}
