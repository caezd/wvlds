"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { CatalogVisual } from "@/components/worlds/catalogue/CatalogVisual";
import { CatalogPicker } from "@/components/personas/fields/shared";
import { deleteWorldShop, removeWorldShopItem } from "@/app/actions/worldShops";
import { useWorldShops, type ShopArticle } from "@/hooks/useWorldShops";
import { messageErreurAction } from "@/lib/actionErrors";
import { formatAmount } from "@/lib/worldCurrency";
import { buybackPriceOf, type WorldShop } from "@/lib/worldShops";
import { ShopDialog, ShopItemDialog, type ShopItemTarget } from "./ShopDialogs";

type Shops = ReturnType<typeof useWorldShops>;

/**
 * La gestion des boutiques, dans Paramètres › Fonctions › Économie ›
 * Boutiques : créer, modifier et supprimer les boutiques, mettre des objets
 * du catalogue en vente, fixer prix, stocks et rachats. La vue Boutiques du
 * monde ne garde que la vitrine.
 */
export function ShopManager({ worldId }: { worldId: string }) {
  const t = useTranslations("shops");
  // Lu en gestionnaire : les boutiques fermées et les catégories du catalogue, sans persona acheteur.
  const shops = useWorldShops(worldId, null, true);
  const [shopDialog, setShopDialog] = useState<{ shop: WorldShop | null } | null>(null);
  const [itemTarget, setItemTarget] = useState<ShopItemTarget | null>(null);

  if (shops.status === "loading") return null;
  if (shops.status === "off") return <p className="text-sm text-muted-foreground">{t("off")}</p>;

  return (
    <div className="space-y-4">
      {shops.shops.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}

      {shops.shops.map((shop) => (
        <ManagedShop
          key={shop.id}
          shop={shop}
          shops={shops}
          onEdit={() => setShopDialog({ shop })}
          onEditItem={setItemTarget}
        />
      ))}

      <Button type="button" size="sm" variant="outline" onClick={() => setShopDialog({ shop: null })}>
        <Plus className="h-3.5 w-3.5" />
        {t("create")}
      </Button>

      <ShopDialog
        worldId={worldId}
        shop={shopDialog?.shop ?? null}
        open={shopDialog !== null}
        buyback={shops.buyback}
        onOpenChange={(o) => !o && setShopDialog(null)}
        onSaved={() => void shops.reload()}
      />
      <ShopItemDialog
        target={itemTarget}
        units={shops.units}
        buyback={shops.buyback}
        onOpenChange={(o) => !o && setItemTarget(null)}
        onSaved={() => void shops.reload()}
      />
    </div>
  );
}

function ManagedShop({
  shop,
  shops,
  onEdit,
  onEditItem,
}: {
  shop: WorldShop;
  shops: Shops;
  onEdit: () => void;
  onEditItem: (target: ShopItemTarget) => void;
}) {
  const t = useTranslations("shops");
  const tCommon = useTranslations("common");
  const headingId = `shop-${shop.id}`;

  // Un objet mis à la corbeille du catalogue ne se vend plus : il n'est pas listé.
  const articles = shops.itemsOf(shop.id).filter((a) => a.catalog && !a.catalog.deleted_at);
  const onSale = new Set(shops.itemsOf(shop.id).map((a) => a.catalog_item_id));
  const available = shops.catalog.filter((c) => !onSale.has(c.id));

  async function removeShop() {
    const res = await deleteWorldShop(shop.id);
    if (!res.ok) toast.error(messageErreurAction(res.error, tCommon));
    await shops.reload();
  }

  async function removeItem(article: ShopArticle) {
    const res = await removeWorldShopItem(article.id);
    if (!res.ok) toast.error(messageErreurAction(res.error, tCommon));
    await shops.reload();
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 id={headingId} className="text-sm font-medium">
            {shop.name}
          </h3>
          {shop.description && <p className="whitespace-pre-line text-xs text-muted-foreground">{shop.description}</p>}
          <div className="flex flex-wrap gap-1.5">
            {!shop.is_open && <Badge tone="warning">{t("closed")}</Badge>}
            {shops.buyback && shop.buyback_enabled && <Badge>{t("buysBack")}</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={t("editShop")} onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <DeleteConfirmDialog
            trigger={
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={t("deleteShop")}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            }
            title={t("deleteTitle", { name: shop.name })}
            description={t("deleteDescription")}
            onConfirm={() => void removeShop()}
          />
        </div>
      </div>

      {articles.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("noItems")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {articles.map((article) => {
            const entry = article.catalog!;
            const buyback = shops.buyback ? buybackPriceOf(shop, article) : null;
            return (
              <li key={article.id} aria-label={entry.name} className="flex items-center gap-3 px-2 py-1.5">
                <CatalogVisual icon={entry.icon} lucideIcon={entry.lucide_icon} imageUrl={entry.image_url} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
                <span className="text-sm tabular-nums">{formatAmount(article.price, shops.units)}</span>
                <span className="w-24 text-right text-xs text-muted-foreground">
                  {article.stock === null ? t("stockPlaceholder") : t("inStock", { count: article.stock })}
                </span>
                {buyback !== null && (
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {t("buybackAt", { price: formatAmount(buyback, shops.units) })}
                  </span>
                )}
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={t("editItem", { name: entry.name })}
                    onClick={() => onEditItem({ shopId: shop.id, catalogItemId: article.catalog_item_id, name: entry.name, item: article })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label={t("removeItem", { name: entry.name })}
                    onClick={() => void removeItem(article)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CatalogPicker
        available={available}
        categories={shops.categories}
        type="inventory"
        label={t("addItem")}
        onSelect={(item) => onEditItem({ shopId: shop.id, catalogItemId: item.id, name: item.name, item: null })}
      />
    </section>
  );
}
