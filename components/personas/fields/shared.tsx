"use client";

// Briques communes aux éditeurs de champ de fiche : un identifiant, le bouton
// de choix d'icône, le visuel d'une entrée de catalogue et le sélecteur.

import { useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ImageIcon, Plus, Search } from "lucide-react";

import { catalogItemMatches, normalizeForSearch, RARITY_COLORS } from "@/lib/worldCatalog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WorldCatalogCategory, WorldCatalogItem, WorldCatalogRarity } from "@/types/worlds";
import { RpgIconPicker } from "../RpgIconPicker";
import { CatalogVisual } from "@/components/worlds/catalogue/CatalogVisual";

/**
 * Identifiant local d'un item de champ.
 *
 * Il ne sert qu'à la clé React et au repérage pendant l'édition : les champs
 * sont enregistrés en bloc, la base ne voit jamais cette valeur.
 */
export function makeItemId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function IconButton({
  icon,
  onChangeIcon,
}: {
  icon: string | undefined;
  onChangeIcon: (v: string | undefined) => void;
}) {
  const t = useTranslations("catalogue");
  return (
    <RpgIconPicker
      value={icon}
      onChange={onChangeIcon}
      trigger={
        <button
          type="button"
          title={icon ? icon.replace(".svg", "") : t("chooseIcon")}
          className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40 hover:bg-muted transition-colors"
        >
          {icon ? (
            <Image src={`/rpg_icons/${icon}`} alt="" unoptimized width={24} height={24} className="h-6 w-6 object-contain dark:invert" />
          ) : (
            <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
          )}
        </button>
      }
    />
  );
}

/** Le visuel d'une entrée de fiche — même règle que dans le catalogue. */
export function EntryVisual({
  icon,
  lucideIcon,
  imageUrl,
  size = 40,
}: {
  icon?: string | null;
  lucideIcon?: string | null;
  imageUrl?: string | null;
  size?: 36 | 40;
}) {
  return <CatalogVisual icon={icon} lucideIcon={lucideIcon} imageUrl={imageUrl} size={size} />;
}

/** Pastille de rareté, à côté du nom d'une entrée. */
export function RarityMark({ rarity }: { rarity: WorldCatalogRarity | null }) {
  if (!rarity) return null;
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: RARITY_COLORS[rarity] }}
    />
  );
}

/**
 * Le choix d'un objet ou d'une compétence dans le catalogue du monde.
 *
 * C'était une liste à plat, sans recherche : passé une trentaine d'entrées, il
 * fallait faire défiler à l'œil, et les catégories patiemment rangées dans le
 * catalogue n'y paraissaient pas. Elle porte maintenant les deux — la
 * recherche apparaît à partir du seuil où elle sert, pour ne pas encombrer les
 * catalogues courts.
 */
const SEARCH_THRESHOLD = 8;

export function CatalogPicker({
  available,
  categories,
  type,
  onSelect,
}: {
  available: WorldCatalogItem[];
  categories?: WorldCatalogCategory[];
  type: "inventory" | "skills";
  onSelect: (item: WorldCatalogItem) => void;
}) {
  const t = useTranslations("catalogue");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matching = useMemo(() => {
    const normalized = normalizeForSearch(query.trim());
    return normalized ? available.filter((item) => catalogItemMatches(item, normalized)) : available;
  }, [available, query]);

  /** Les entrées par catégorie, dans l'ordre du catalogue ; les orphelines en fin. */
  const groups = useMemo(() => {
    const byCategory = new Map<string | null, WorldCatalogItem[]>();
    for (const item of matching) {
      const key = item.category_id ?? null;
      const bucket = byCategory.get(key);
      if (bucket) bucket.push(item);
      else byCategory.set(key, [item]);
    }
    const ordered: { id: string | null; name: string | null; items: WorldCatalogItem[] }[] = [];
    for (const category of categories ?? []) {
      const found = byCategory.get(category.id);
      if (found) {
        ordered.push({ id: category.id, name: category.name, items: found });
        byCategory.delete(category.id);
      }
    }
    // Ce qui reste : les sans-catégorie, et les catégories que l'appelant n'a
    // pas fournies — mieux vaut les montrer sans titre que les faire
    // disparaître du sélecteur.
    const leftovers = [...byCategory.values()].flat();
    if (leftovers.length > 0) ordered.push({ id: null, name: null, items: leftovers });
    return ordered;
  }, [matching, categories]);

  const showSearch = available.length >= SEARCH_THRESHOLD;
  const empty = available.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => { setQuery(""); setOpen(true); }}
        disabled={empty}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="h-3.5 w-3.5" />
        {empty
          ? (type === "inventory" ? t("allItemsAdded") : t("allSkillsAdded"))
          : t("addFromCatalog")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{type === "inventory" ? t("chooseItem") : t("chooseSkill")}</DialogTitle>
          </DialogHeader>

          {showSearch && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-9 w-full rounded-lg border border-border-soft bg-background pl-8 pr-3 text-sm outline-none transition-colors focus:border-primary/40"
              />
            </div>
          )}

          <div className="space-y-3 max-h-80 overflow-y-auto -mx-1 px-1">
            {groups.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("noResults")}</p>
            )}
            {groups.map((group) => (
              <div key={group.id ?? "__uncat__"} className="space-y-1">
                {group.name && (
                  <p className="px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {group.name}
                  </p>
                )}
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onSelect(item); setOpen(false); }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted transition-colors"
                  >
                    <EntryVisual icon={item.icon} lucideIcon={item.lucide_icon} imageUrl={item.image_url} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <RarityMark rarity={item.rarity ?? null} />
                        <span className="truncate">{item.name}</span>
                      </p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
