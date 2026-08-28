"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

import type { DlItem } from "@/types/personas";
import { makeItemId } from "./shared";

export function DlField({
  initialItems,
  onSave,
}: {
  initialItems: DlItem[];
  onSave: (items: DlItem[]) => void;
}) {
  const tCommon = useTranslations("common");
  const [items, setItems] = useState<DlItem[]>(initialItems);

  function update(next: DlItem[]) { setItems(next); onSave(next); }
  function patch(id: string, key: keyof DlItem, val: string) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }
  function addItem() { update([...items, { id: makeItemId(), label: "", description: "" }]); }
  function removeItem(id: string) { update(items.filter((it) => it.id !== id)); }

  return (
    <div className="space-y-2 pr-24">
      <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2">
        {items.map((item) => (
          <div key={item.id} className="group/dl contents">
            <input
              value={item.label}
              onChange={(e) => patch(item.id, "label", e.target.value)}
              placeholder="Titre"
              className="min-w-[3rem] self-start bg-transparent text-sm font-semibold text-left outline-none placeholder:text-muted-foreground/40"
            />
            <div className="flex items-start gap-2">
              <input
                value={item.description}
                onChange={(e) => patch(item.id, "description", e.target.value)}
                placeholder="Description"
                className="flex-1 min-w-0 bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              />
              <button
                aria-label={tCommon("remove")}
                type="button"
                onClick={() => removeItem(item.id)}
                className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/dl:opacity-100 hover:text-destructive transition-opacity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter une entrée
      </button>
    </div>
  );
}
