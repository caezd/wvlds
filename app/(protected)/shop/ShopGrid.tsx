// app/(protected)/shop/ShopGrid.tsx
"use client";

import { useCallback, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner"; // ou ton système de toasts shadcn

type ShopItem = {
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
      const t = q.trim().toLowerCase();
      res = res.filter(
        (i) =>
          i.name.toLowerCase().includes(t) || i.key.toLowerCase().includes(t),
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

        const { data, error } = await supabase.rpc("shop_purchase", {
          p_item_key: it.key,
          p_equip: true,
        });
        if (error) {
          /* toast erreur */
        }

        if (error) throw error;

        // Vérité serveur
        await refetchShop();
        toast.success(it.owned ? "Équipement mis à jour" : "Achat réussi");
      } catch (e: any) {
        // Rollback
        setCoins(rollback.coins);
        setItems(rollback.items);
        toast.error(e?.message ?? "Erreur lors de l’achat");
      } finally {
        markLoading(it.id, false);
      }
    },
    [coins, items, loadingById, supabase, refetchShop],
  );

  const handleEquip = useCallback(
    async (it: ShopItem) => {
      if (loadingById[it.id] || !it.owned) return;
      markLoading(it.id, true);
      const rollback = { items: [...items] };
      // Optimisme: marquer l’unique item du slot comme équipé
      setItems((prev) =>
        prev.map((x) =>
          x.slot === it.slot ? { ...x, equipped: x.id === it.id } : x,
        ),
      );
      try {
        const { error } = await supabase.rpc("shop_equip", {
          p_item_key: it.key,
        });
        if (error) throw error;
        await refetchShop();
        toast.success("Équipé");
      } catch (e: any) {
        setItems(rollback.items);
        toast.error(e?.message ?? "Erreur lors de l’équipement");
      } finally {
        markLoading(it.id, false);
      }
    },
    [items, loadingById, supabase, refetchShop],
  );

  const handleUnequip = useCallback(
    async (slot: string) => {
      // On cherche l’item actuellement équipé pour avoir un id pour le spinner
      const current = items.find((x) => x.slot === slot && x.equipped);
      if (!current) return;
      if (loadingById[current.id]) return;

      markLoading(current.id, true);
      const rollback = { items: [...items] };

      // Optimisme: déséquiper
      setItems((prev) =>
        prev.map((x) => (x.slot === slot ? { ...x, equipped: false } : x)),
      );

      try {
        const { error } = await supabase.rpc("shop_unequip", { p_slot: slot });
        if (error) throw error;
        await refetchShop();
        toast.success("Déséquipé");
      } catch (e: any) {
        setItems(rollback.items);
        toast.error(e?.message ?? "Erreur lors du déséquipement");
      } finally {
        markLoading(current.id, false);
      }
    },
    [items, loadingById, supabase, refetchShop],
  );

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Select value={slotFilter} onValueChange={setSlotFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Filtrer par type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="avatar_frame">Cadres d’avatar</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Recherche"
            className="w-56"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Solde: <span className="font-medium text-foreground">{coins}</span>{" "}
          coins
        </div>
      </div>

      {/* Grille */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {filtered.map((it) => {
          const busy = !!loadingById[it.id];
          return (
            <Card
              key={it.id}
              className={cn(
                "overflow-hidden border",
                it.equipped && "ring-2 ring-primary",
              )}
            >
              <div className="relative aspect-square">
                <img
                  src={it.preview_url ?? it.asset_url}
                  alt={it.name}
                  className="h-full w-full object-cover"
                />
                {it.equipped && (
                  <div className="absolute inset-0 border-2 border-primary/70 pointer-events-none" />
                )}
                {!it.owned && (
                  <div className="absolute right-2 top-2 rounded bg-background/80 px-2 py-0.5 text-xs shadow">
                    {it.price_coins} coins
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
                      {busy ? "Traitement…" : `Acheter (${it.price_coins})`}
                    </Button>
                  ) : it.equipped ? (
                    <>
                      <Button
                        variant="secondary"
                        className="flex-1"
                        disabled={busy}
                        onClick={() => handleUnequip(it.slot)}
                      >
                        {busy ? "…" : "Déséquiper"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      className="flex-1"
                      disabled={busy}
                      onClick={() => handleEquip(it)}
                    >
                      {busy ? "…" : "Équiper"}
                    </Button>
                  )}
                </div>
                {it.owned && !it.equipped && coins < it.price_coins && (
                  <div className="text-xs text-muted-foreground">
                    Acheté. Solde actuel: {coins}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recharger manuellement si besoin */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={refetchShop}>
          Rafraîchir
        </Button>
      </div>
    </div>
  );
}
