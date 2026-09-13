"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Plus, TriangleAlert, X } from "lucide-react";

import { indexCatalog, resolveCatalogEntry } from "@/lib/worldCatalog";
import type { SkillItem } from "@/types/personas";
import type { WorldCatalogCategory, WorldCatalogItem } from "@/types/worlds";
import { CatalogPicker, EntryVisual, IconButton, RarityMark, makeItemId } from "./shared";

export function SkillsField({
  initialItems,
  onSave,
  catalogItems,
  catalogCategories,
}: {
  initialItems: SkillItem[];
  onSave: (items: SkillItem[]) => void;
  catalogItems?: WorldCatalogItem[];
  catalogCategories?: WorldCatalogCategory[];
}) {
  const tCommon = useTranslations("common");
  const tCatalogue = useTranslations("catalogue");
  const [items, setItems] = useState<SkillItem[]>(initialItems);

  const catalog = useMemo(
    () => (catalogItems ? indexCatalog(catalogItems) : undefined),
    [catalogItems],
  );

  function update(next: SkillItem[]) {
    setItems(next);
    onSave(next);
  }

  function patch(id: string, key: keyof SkillItem, val: string | undefined) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }

  function addItem() {
    update([...items, { id: makeItemId(), name: "", level: "", description: "", icon: undefined }]);
  }

  function removeItem(id: string) {
    update(items.filter((it) => it.id !== id));
  }

  // ── Mode restreint (catalogue du monde) ────────────────────────────────────
  if (catalogItems !== undefined) {
    const usedIds = new Set(items.map((i) => i.catalog_id).filter(Boolean));
    const available = catalogItems.filter((c) => !usedIds.has(c.id));

    function addFromCatalog(entry: WorldCatalogItem) {
      update([...items, {
        id: makeItemId(),
        catalog_id: entry.id,
        // Copie de secours seulement : c'est le catalogue qui fait foi à
        // l'affichage (voir `resolveCatalogEntry`).
        name: entry.name,
        description: entry.description ?? undefined,
        icon: entry.icon ?? undefined,
        level: "",
      }]);
    }

    return (
      <div className="space-y-2 pr-24">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
          <Lock className="h-3 w-3" /> {tCatalogue("skillsFromCatalog")}
        </div>
        {items.map((item) => {
          const resolved = resolveCatalogEntry(item, catalog);
          return (
            <div key={item.id} className="flex items-center gap-2 group/skill">
              <EntryVisual icon={resolved.icon} imageUrl={resolved.image_url} />
              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                <RarityMark rarity={resolved.rarity} />
                <span className="truncate text-sm font-medium">{resolved.name}</span>
                {resolved.orphaned && (
                  <span
                    title={tCatalogue("orphanedItem")}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
                  >
                    <TriangleAlert className="h-3 w-3" />
                    {tCatalogue("orphanedItem")}
                  </span>
                )}
              </span>
              <input
                value={item.level}
                onChange={(e) => patch(item.id, "level", e.target.value)}
                placeholder={tCatalogue("skillLevel")}
                className="w-20 shrink-0 bg-transparent text-xs text-right text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              />
              <button
                aria-label={tCommon("remove")}
                type="button"
                onClick={() => removeItem(item.id)}
                className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover/skill:opacity-100 sm:focus-within:opacity-100 hover:text-destructive transition-opacity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        <CatalogPicker
          available={available}
          categories={catalogCategories}
          type="skills"
          onSelect={addFromCatalog}
        />
      </div>
    );
  }

  // ── Mode libre ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2 pr-24">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-2 group/skill">
          <IconButton icon={item.icon} onChangeIcon={(v) => patch(item.id, "icon", v)} />
          <div className="flex-1 space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <input
                value={item.name}
                onChange={(e) => patch(item.id, "name", e.target.value)}
                placeholder={tCatalogue("skillNamePlaceholder")}
                className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40"
              />
              <input
                value={item.level}
                onChange={(e) => patch(item.id, "level", e.target.value)}
                placeholder={tCatalogue("skillLevel")}
                className="w-20 shrink-0 bg-transparent text-xs text-right text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              />
            </div>
            <input
              value={item.description ?? ""}
              onChange={(e) => patch(item.id, "description", e.target.value)}
              placeholder={tCatalogue("descPlaceholder")}
              className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
            />
          </div>
          <button
            aria-label={tCommon("remove")}
            type="button"
            onClick={() => removeItem(item.id)}
            className="shrink-0 mt-2.5 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover/skill:opacity-100 sm:focus-within:opacity-100 hover:text-destructive transition-opacity"
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
        <Plus className="h-3.5 w-3.5" /> {tCatalogue("addSkillBtn")}
      </button>
    </div>
  );
}
