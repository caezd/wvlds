"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import type { WorldCatalogItem } from "@/types/worlds";
import { Drawer, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { SideSheetContent } from "@/components/ui/side-sheet";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { useWikiLinks } from "@/components/worlds/wiki/WikiLinkContext";
import { CatalogVisual } from "./CatalogVisual";
import { RarityBadge } from "./CatalogItemDialog";
import { WikiPageChip, type WikiPageRef } from "./WikiPagePicker";

/** Les pages liées d'un objet (migration 186), lues à l'ouverture de la fiche. */
export function useCatalogItemPages(itemId: string | null, open: boolean): WikiPageRef[] | null {
  const supabase = useMemo(() => createClient(), []);
  const [pages, setPages] = useState<WikiPageRef[] | null>(null);
  useEffect(() => {
    if (!itemId || !open) { setPages(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from(TABLE.WORLD_CATALOG_ITEM_PAGES)
        .select("sort_index, page:page_id(id, title, slug, icon, deleted_at)")
        .eq("item_id", itemId)
        .order("sort_index");
      if (cancelled) return;
      type Row = { page: (WikiPageRef & { deleted_at: string | null }) | null };
      setPages(((data ?? []) as unknown as Row[]).map((r) => r.page).filter((p): p is WikiPageRef & { deleted_at: string | null } => !!p && !p.deleted_at));
    })();
    return () => { cancelled = true; };
  }, [supabase, itemId, open]);
  return pages;
}

/**
 * La fiche d'un objet ou d'une compétence : visuel, rareté, description en
 * Markdown (avec les `[[liens]]` du wiki quand un fournisseur est monté),
 * propriétés, pages du wiki liées, usage. Ouverte depuis le catalogue comme
 * depuis l'inventaire ou les compétences d'un persona.
 */
export function CatalogItemDetail({
  item,
  usageCount,
  open,
  onOpenChange,
  children,
}: {
  item: WorldCatalogItem;
  usageCount?: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Sections de plus, après les pages liées (prérequis, recette…). */
  children?: React.ReactNode;
}) {
  const t = useTranslations("catalogue");
  const router = useRouter();
  const wikiLinks = useWikiLinks();
  const pages = useCatalogItemPages(item.id, open);

  const description = item.description?.trim() ? (wikiLinks ? wikiLinks.resolve(item.description) : item.description) : null;
  const openPage = (page: WikiPageRef) => {
    onOpenChange(false);
    if (wikiLinks) wikiLinks.onWikiLink(page.slug);
    else router.push(`/w/${item.world_id}?view=wiki&page=${encodeURIComponent(page.slug)}`);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <SideSheetContent>
        <DrawerHeader className="px-6 pt-6 pb-2">
          <div className="flex items-start gap-3">
            <CatalogVisual icon={item.icon ?? null} lucideIcon={item.lucide_icon ?? null} imageUrl={item.image_url ?? null} size={56} />
            <div className="min-w-0 flex-1 space-y-1 text-left">
              <DrawerTitle className="text-lg leading-tight">{item.name}</DrawerTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {item.rarity && <RarityBadge rarity={item.rarity} />}
                {item.type === "inventory" && item.stackable === false && <span>{t("uniqueItem")}</span>}
                {item.type === "inventory" && item.max_quantity ? <span>{t("maxQuantityValue", { count: item.max_quantity })}</span> : null}
                {usageCount !== undefined && <span>{t("usageCount", { count: usageCount })}</span>}
              </div>
            </div>
          </div>
        </DrawerHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6" data-testid="catalog-item-detail">
          {description ? (
            <MarkdownRenderer content={description} onWikiLink={wikiLinks?.onWikiLink} onMapLink={wikiLinks?.onMapLink} className="text-sm prose-sm" />
          ) : (
            <p className="text-sm text-muted-foreground">{t("noDescription")}</p>
          )}

          {item.properties && item.properties.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("properties")}</h3>
              <dl className="divide-y divide-border-soft rounded-lg border border-border-soft">
                {item.properties.map((property, index) => (
                  <div key={index} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                    <dt className="text-xs text-muted-foreground">{property.label}</dt>
                    <dd className="text-xs font-medium">{property.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {pages && pages.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("linkedPages")}</h3>
              <div className="flex flex-wrap gap-1.5">
                {pages.map((page) => <WikiPageChip key={page.id} page={page} onOpen={() => openPage(page)} />)}
              </div>
            </section>
          )}

          {children}
        </div>
      </SideSheetContent>
    </Drawer>
  );
}
