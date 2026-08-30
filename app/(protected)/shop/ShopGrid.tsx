// app/(protected)/shop/ShopGrid.tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner"; // ou ton système de toasts shadcn

export type ShopItem = {
  id: string;
  key: string;
  name: string;
  slot: "avatar_frame" | string;
  price_coins: number;
  asset_url: string;
  preview_url: string | null;
  active: boolean;
  owned: boolean;
  can_afford: boolean;
  equipped: boolean;
};

export default function ShopGrid({
  initialItems,
  initialCoins,
}: {
  initialItems: ShopItem[];
  initialCoins: number;
}) {
  const t = useTranslations("shop");
  const supabase = createClient();
  const [coins, setCoins] = useState<number>(initialCoins);
  const [items, setItems] = useState<ShopItem[]>(initialItems);
  const [slotFilter, setSlotFilter] = useState<string>("all");
  const [q, setQ] = useState<string>("");

  // Map d’états de chargement par item (achat/équipement)
  const [loadingById, setLoadingById] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    let res = items;
    if (slotFilter !== "all") res = res.filter((i) => i.slot === slotFilter);
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      res = res.filter(
        (i) =>
          i.name.toLowerCase().includes(term) || i.key.toLowerCase().includes(term),
      );
    }
    return res;
  }, [items, slotFilter, q]);

  const markLoading = (id: string, v: boolean) =>
    setLoadingById((m) => ({ ...m, [id]: v }));

  const refetchShop = useCallback(async () => {
    // Revalider les infos (owned, can_afford, equipped, coins)
    const [{ data: newItems, error: errItems }, { data: bal, error: errBal }] =
      await Promise.all([
        supabase.rpc("shop_list_items"),
        supabase.from("gamification_balances").select("coins").single(),
      ]);
    if (!errItems && Array.isArray(newItems)) setItems(newItems as ShopItem[]);
    if (!errBal) setCoins(bal?.coins ?? 0);
  }, [supabase]);

  const handlePurchase = useCallback(
    async (it: ShopItem) => {
      if (loadingById[it.id]) return;
      markLoading(it.id, true);
      // Optimisme: si pas owned et on peut payer, déduire provisoirement
      const rollback = {
        coins,
        items: [...items],
      };
      let optimisticCoins = coins;
      try {
        if (!it.owned) {
          if (coins < it.price_coins) {
            toast.error("Solde insuffisant");
            return;
          }
          optimisticCoins = coins - it.price_coins;
          setCoins(optimisticCoins);
        }
        // Optimisme items (owned/equipped)
        setItems((prev) =>
          prev.map((x) =>
            x.id === it.id
              ? {
                  ...x,
                  owned: true,
                  equipped: true,
                  can_afford: optimisticCoins >= x.price_coins,
                }
              : x,
          ),
        );

        const { error } = await supabase.rpc("shop_purchase", {
          p_item_key: it.key,
          p_equip: false,
        });
        if (error) {
          /* toast erreur */
        }

        if (error) throw error;

        // Vérité serveur
        await refetchShop();
        toast.success(it.owned ? "Équipement mis à jour" : "Achat réussi");
      } catch (e: unknown) {
        // Rollback
        setCoins(rollback.coins);
        setItems(rollback.items);
        // Pas `e.message` : texte brut de PostgreSQL, il nomme table et policy.
        console.error("[ShopGrid] achat", e);
        toast.error(t("purchaseError"));
      } finally {
        markLoading(it.id, false);
      }
    },
    [coins, items, loadingById, supabase, refetchShop, t],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-1 text-sm">
          <span className="font-medium text-foreground">{coins}</span>
          <span aria-hidden>🪙</span>
        </div>
      </header>

      {/* Filtres */}
      <div className="flex items-center justify-between gap-2">
        <Select value={slotFilter} onValueChange={setSlotFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("filterType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allTypes")}</SelectItem>
            <SelectItem value="avatar_frame">{t("avatarFrame")}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-56"
        />
      </div>

      {/* Grille */}
      <div className="grid grid-cols-3 gap-4 md:grid-cols-5 lg:grid-cols-6">
        {filtered.map((it) => {
          const busy = !!loadingById[it.id];
          return (
            <Card
              key={it.id}
              className="overflow-hidden border"
            >
              <div className="relative aspect-square">
                <Image
                  src={it.preview_url ?? it.asset_url}
                  alt={it.name}
                  unoptimized
                  fill
                  sizes="(min-width: 1024px) 200px, 45vw"
                  className="object-cover"
                />

                {!it.owned && (
                  <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-background/80 px-2 py-0.5 text-xs shadow">
                    {it.price_coins}
                    <span aria-hidden>🪙</span>
                  </div>
                )}
              </div>

              <CardContent className="space-y-2 p-3">
                <div className="text-sm font-medium">{it.name}</div>
                <div className="flex gap-2">
                  {!it.owned ? (
                    <Button
                      className="flex-1"
                      disabled={busy || coins < it.price_coins}
                      onClick={() => handlePurchase(it)}
                    >
                      {busy ? t("processing") : t("buy")}
                    </Button>
                  ) : (
                    <Button className="flex-1" variant="secondary" disabled>
                      {t("owned")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
