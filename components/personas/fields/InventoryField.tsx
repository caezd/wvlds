"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { ImageIcon, Lock, Plus, X } from "lucide-react";

import type { InventoryItem } from "@/types/personas";
import type { WorldInventoryItem } from "@/types/worlds";
import { CatalogPicker, IconButton, makeItemId } from "./shared";

export function InventoryField({
  initialItems,
  onSave,
  catalogItems,
}: {
  initialItems: InventoryItem[];
  onSave: (items: InventoryItem[]) => void;
  catalogItems?: WorldInventoryItem[];
}) {
  const tCommon = useTranslations("common");
  const tCatalogue = useTranslations("catalogue");
  const [items, setItems] = useState<InventoryItem[]>(initialItems);

  function update(next: InventoryItem[]) {
    setItems(next);
    onSave(next);
  }

  function patch(id: string, key: keyof InventoryItem, val: string | number | undefined) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }

  function addItem() {
    update([...items, { id: makeItemId(), name: "", quantity: 1, description: "", icon: undefined }]);
  }

  function removeItem(id: string) {
    update(items.filter((it) => it.id !== id));
  }

  // ── Mode restreint (catalogue du monde) ────────────────────────────────────
  if (catalogItems !== undefined) {
    const usedIds = new Set(items.map((i) => i.catalog_id).filter(Boolean));
    const available = catalogItems.filter((c) => !usedIds.has(c.id));

    function addFromCatalog(cat: WorldInventoryItem) {
      update([...items, {
        id: makeItemId(),
        catalog_id: cat.id,
        name: cat.name,
        description: cat.description ?? undefined,
        icon: cat.icon ?? undefined,
        quantity: 1,
      }]);
    }

    return (
      <div className="space-y-2 pr-24">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
          <Lock className="h-3 w-3" /> Inventaire du catalogue
        </div>
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 group/item">
            <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40">
              {item.icon ? (
                <Image src={`/rpg_icons/${item.icon}`} alt="" unoptimized width={24} height={24} className="h-6 w-6 object-contain dark:invert" />
              ) : (
                <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
              )}
            </div>
            <span className="flex-1 min-w-0 text-sm font-medium truncate">{item.name}</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-muted-foreground">×</span>
              <input
                type="number"
                min={0}
                value={item.quantity}
                onChange={(e) => patch(item.id, "quantity", Number(e.target.value))}
                className="w-12 bg-transparent text-sm text-right outline-none tabular-nums"
              />
            </div>
            <button
              aria-label={tCommon("remove")}
              type="button"
              onClick={() => removeItem(item.id)}
              className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <CatalogPicker available={available} label="objet" onSelect={addFromCatalog} />
      </div>
    );
  }

  // ── Mode libre ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2 pr-24">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-2 group/item">
          <IconButton icon={item.icon} onChangeIcon={(v) => patch(item.id, "icon", v)} />
          <div className="flex-1 space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <input
                value={item.name}
                onChange={(e) => patch(item.id, "name", e.target.value)}
                placeholder={tCatalogue("itemNamePlaceholder")}
                className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40"
              />
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">×</span>
                <input
                  type="number"
                  min={0}
                  value={item.quantity}
                  onChange={(e) => patch(item.id, "quantity", Number(e.target.value))}
                  className="w-12 bg-transparent text-sm text-right outline-none placeholder:text-muted-foreground/40 tabular-nums"
                />
              </div>
            </div>
            <input
              value={item.description ?? ""}
              onChange={(e) => patch(item.id, "description", e.target.value)}
              placeholder="Description (optionnel)"
              className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
            />
          </div>
          <button
            aria-label={tCommon("remove")}
            type="button"
            onClick={() => removeItem(item.id)}
            className="shrink-0 mt-2.5 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-opacity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter un objet
      </button>
    </div>
  );
}
