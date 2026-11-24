"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Pencil, Plus, Store } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TabBar, TabBarTrigger } from "@/components/ui/tab-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { useCurrentUser } from "@/components/providers/CurrentUserProvider";
import { useWorldShops } from "@/hooks/useWorldShops";
import { formatAmount } from "@/lib/worldCurrency";
import type { WorldShop } from "@/lib/worldShops";
import { ShopDialog } from "./ShopDialogs";
import { ShopFront } from "./ShopFront";

/**
 * La vue Boutiques d'un monde (`?view=shops`, migration 249) : une boutique
 * par onglet, ses articles, et le persona pour qui l'on achète. Qui gère
 * l'économie passe en modification pour créer les boutiques et fixer prix,
 * stocks et rachats.
 */
export function WorldShops({ worldId, canManage }: { worldId: string; canManage: boolean }) {
  const t = useTranslations("shops");
  const tCommon = useTranslations("common");
  const tCatalogue = useTranslations("catalogue");
  const { userId } = useCurrentUser();
  const shops = useWorldShops(worldId, userId, canManage);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [shopDialog, setShopDialog] = useState<{ shop: WorldShop | null } | null>(null);

  const editing = canManage && editMode;
  const current = shops.shops.find((s) => s.id === selected) ?? shops.shops[0] ?? null;
  const buyer = shops.personas.find((p) => p.id === buyerId) ?? shops.personas[0] ?? null;

  return (
    <div className="flex h-full w-full flex-col">
      <WorldPanelHeader
        icon={<Store className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("title")}
        right={
          canManage &&
          shops.status === "on" && (
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              aria-pressed={editMode}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
            >
              <Pencil className="h-3 w-3" />
              {editMode ? tCatalogue("editingActive") : tCommon("edit")}
            </button>
          )
        }
      />

      {shops.status === "off" && <p className="p-6 text-sm text-muted-foreground">{t("off")}</p>}

      {shops.status === "on" && (
        <>
          {/* Pour qui l'on achète : un de mes personas du monde, et sa bourse. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
            {shops.personas.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noPersona")}</p>
            ) : (
              <Select value={buyer?.id ?? ""} onValueChange={setBuyerId}>
                <SelectTrigger aria-label={t("buyer")} className="h-8 w-auto min-w-48 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {shops.personas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      <span className="text-muted-foreground tabular-nums">· {formatAmount(p.balance, shops.units)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {editing && (
              <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => setShopDialog({ shop: null })}>
                <Plus className="h-3.5 w-3.5" />
                {t("create")}
              </Button>
            )}
          </div>

          {shops.shops.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
              {canManage && !editing && (
                <Button type="button" size="sm" onClick={() => setShopDialog({ shop: null })}>
                  <Plus className="h-3.5 w-3.5" />
                  {t("create")}
                </Button>
              )}
            </div>
          ) : (
            <Tabs value={current?.id} onValueChange={setSelected} className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0">
                <TabBar listClassName="px-4">
                  {shops.shops.map((shop) => (
                    <TabBarTrigger key={shop.id} value={shop.id} className="flex items-center gap-1.5">
                      {shop.name}
                      {!shop.is_open && (
                        <>
                          <Lock className="h-3 w-3" aria-hidden />
                          <span className="sr-only">{t("closed")}</span>
                        </>
                      )}
                    </TabBarTrigger>
                  ))}
                </TabBar>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {shops.shops.map((shop) => (
                  <TabsContent key={shop.id} value={shop.id} className="mt-0">
                    <ShopFront
                      shop={shop}
                      shops={shops}
                      buyer={buyer}
                      editing={editing}
                      onEditShop={() => setShopDialog({ shop })}
                    />
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          )}

          <ShopDialog
            worldId={worldId}
            shop={shopDialog?.shop ?? null}
            open={shopDialog !== null}
            onOpenChange={(o) => !o && setShopDialog(null)}
            onSaved={() => void shops.reload()}
          />
        </>
      )}
    </div>
  );
}
