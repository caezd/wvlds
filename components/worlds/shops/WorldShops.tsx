"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lock, Settings, Store } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TabBar, TabBarTrigger } from "@/components/ui/tab-bar";
import { buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { useCurrentUser } from "@/components/providers/CurrentUserProvider";
import { useWorldShops } from "@/hooks/useWorldShops";
import { formatAmount } from "@/lib/worldCurrency";
import { ShopFront } from "./ShopFront";

/**
 * La vue Boutiques d'un monde (`?view=shops`, migration 249) : une boutique
 * par onglet, ses articles, et le persona pour qui l'on achète. Boutiques,
 * prix, stocks et rachats se gèrent dans Paramètres › Fonctions › Économie ›
 * Boutiques (ShopManager) : `manageHref` y mène qui règle le monde.
 */
export function WorldShops({
  worldId,
  canManage,
  manageHref = null,
}: {
  worldId: string;
  /** Qui gère l'économie voit aussi les boutiques fermées. */
  canManage: boolean;
  manageHref?: string | null;
}) {
  const t = useTranslations("shops");
  const { userId } = useCurrentUser();
  const shops = useWorldShops(worldId, userId, canManage);
  const [selected, setSelected] = useState<string | null>(null);
  const [buyerId, setBuyerId] = useState<string | null>(null);

  const current = shops.shops.find((s) => s.id === selected) ?? shops.shops[0] ?? null;
  const buyer = shops.personas.find((p) => p.id === buyerId) ?? shops.personas[0] ?? null;

  return (
    <div className="flex h-full w-full flex-col">
      <WorldPanelHeader
        icon={<Store className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("title")}
        right={
          manageHref && (
            <Link href={manageHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}>
              <Settings className="h-3 w-3" />
              {t("manage")}
            </Link>
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
          </div>

          {shops.shops.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
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
                    <ShopFront shop={shop} shops={shops} buyer={buyer} />
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          )}
        </>
      )}
    </div>
  );
}
