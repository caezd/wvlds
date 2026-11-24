"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { CatalogVisual } from "@/components/worlds/catalogue/CatalogVisual";
import { CatalogPicker } from "@/components/personas/fields/shared";
import { deleteWorldShop, removeWorldShopItem } from "@/app/actions/worldShops";
import { messageErreurAction } from "@/lib/actionErrors";
import { formatAmount } from "@/lib/worldCurrency";
import { buybackPriceOf, maxPurchasable, type WorldShop } from "@/lib/worldShops";
import type { ShopArticle, ShopBuyer, useWorldShops } from "@/hooks/useWorldShops";
import { ShopItemDialog, TradeDialog, type ShopItemTarget, type TradeTarget } from "./ShopDialogs";

type Shops = ReturnType<typeof useWorldShops>;

/** La vitrine d'une boutique : ce qu'elle vend, et sa gestion en mode modification. */
export function ShopFront({
  shop,
  shops,
  buyer,
  editing,
  onEditShop,
}: {
  shop: WorldShop;
  shops: Shops;
  buyer: ShopBuyer | null;
  editing: boolean;
  onEditShop: () => void;
}) {
  const t = useTranslations("shops");
  const tCommon = useTranslations("common");
  const [itemTarget, setItemTarget] = useState<ShopItemTarget | null>(null);
  const [trade, setTrade] = useState<TradeTarget | null>(null);

  // Un objet mis à la corbeille du catalogue ne se vend plus : la base refuse.
  const articles = shops.itemsOf(shop.id).filter((a) => a.catalog && !a.catalog.deleted_at);
  const onSale = useMemo(() => new Set(shops.itemsOf(shop.id).map((a) => a.catalog_item_id)), [shops, shop.id]);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {shop.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{shop.description}</p>}
          <div className="flex flex-wrap gap-1.5">
            {shop.buyback_enabled && <Badge>{t("buysBack")}</Badge>}
            {!shop.is_open && <Badge tone="warning">{t("closedHint")}</Badge>}
          </div>
        </div>
        {editing && (
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onEditShop}>
              <Pencil className="h-3.5 w-3.5" />
              {t("editShop")}
            </Button>
            <DeleteConfirmDialog
              trigger={
                <Button type="button" size="sm" variant="outline" aria-label={t("deleteShop")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              }
              title={t("deleteTitle", { name: shop.name })}
              description={t("deleteDescription")}
              onConfirm={() => void removeShop()}
            />
          </div>
        )}
      </div>

      {articles.length === 0 && !editing && <p className="text-sm text-muted-foreground">{t("noItems")}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {articles.map((article) => {
          const entry = article.catalog!;
          const held = buyer ? shops.held(buyer.id, article.catalog_item_id) : 0;
          const buyback = buybackPriceOf(shop, article);
          const soldOut = article.stock === 0;
          return (
            <article
              key={article.id}
              aria-label={entry.name}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start gap-3">
                <CatalogVisual icon={entry.icon} lucideIcon={entry.lucide_icon} imageUrl={entry.image_url} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.name}</p>
                  {entry.description && <p className="line-clamp-2 text-xs text-muted-foreground">{entry.description}</p>}
                </div>
                {editing && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={t("editItem", { name: entry.name })}
                      onClick={() => setItemTarget({ shopId: shop.id, catalogItemId: article.catalog_item_id, name: entry.name, item: article })}
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
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="text-sm font-medium text-foreground tabular-nums">{formatAmount(article.price, shops.units)}</span>
                {soldOut ? (
                  <Badge tone="outline">{t("soldOut")}</Badge>
                ) : (
                  article.stock !== null && <span>{t("inStock", { count: article.stock })}</span>
                )}
                {buyback !== null && <span>{t("buybackAt", { price: formatAmount(buyback, shops.units) })}</span>}
                {held > 0 && <span>{t("held", { count: held })}</span>}
              </div>

              <div className="mt-auto flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!buyer || soldOut}
                  onClick={() =>
                    setTrade({
                      mode: "buy",
                      itemId: article.id,
                      name: entry.name,
                      unitPrice: article.price,
                      max: buyer ? maxPurchasable(article, buyer.balance) : 0,
                    })
                  }
                >
                  {t("buy")}
                </Button>
                {buyer && held > 0 && buyback !== null && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setTrade({ mode: "sell", itemId: article.id, name: entry.name, unitPrice: buyback, max: held })}
                  >
                    {t("sell")}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {editing && (
        <CatalogPicker
          available={available}
          categories={shops.categories}
          type="inventory"
          label={t("addItem")}
          onSelect={(item) => setItemTarget({ shopId: shop.id, catalogItemId: item.id, name: item.name, item: null })}
        />
      )}

      <ShopItemDialog
        target={itemTarget}
        units={shops.units}
        onOpenChange={(o) => !o && setItemTarget(null)}
        onSaved={() => void shops.reload()}
      />
      <TradeDialog
        target={trade}
        buyer={buyer}
        units={shops.units}
        onOpenChange={(o) => !o && setTrade(null)}
        run={(target, quantity) =>
          buyer
            ? target.mode === "buy"
              ? shops.buy(buyer.id, target.itemId, quantity)
              : shops.sell(buyer.id, target.itemId, quantity)
            : Promise.resolve({ ok: false, error: "failed" })
        }
      />
    </div>
  );
}
