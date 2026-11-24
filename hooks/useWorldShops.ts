"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { DEFAULT_CURRENCY_UNITS, currencyUnitsOf, type CurrencyUnit } from "@/lib/worldCurrency";
import { worldHasShops, type WorldShop, type WorldShopItem } from "@/lib/worldShops";
import type { InventoryCatalogEntry } from "@/hooks/usePersonaInventory";
import type { WorldCatalogCategory, WorldCatalogItem } from "@/types/worlds";

/** Un article, avec l'objet du catalogue qu'il vend. */
export type ShopArticle = WorldShopItem & { catalog: InventoryCatalogEntry | null };

/** Un de mes personas dans ce monde, et ce que contient sa bourse. */
export type ShopBuyer = { id: string; name: string; avatar_url: string | null; balance: number };

export type ShopError = "stock" | "funds" | "full" | "max" | "insufficient" | "failed";
export type ShopResult = { ok: true } | { ok: false; error: ShopError };

const SHOP_COLUMNS = "id, world_id, name, description, lucide_icon, is_open, buyback_enabled, buyback_percent, sort_index";
const ITEM_COLUMNS =
  "id, shop_id, catalog_item_id, price, stock, buyback_price, sort_index, " +
  "catalog:catalog_item_id(id, name, description, icon, lucide_icon, image_url, rarity, stackable, max_quantity, deleted_at)";

/** Les messages de la base (migrations 246, 247, 249), ramenés à ce que l'interface dit. */
function errorOf(error: { message?: string } | null): ShopError {
  const msg = error?.message ?? "";
  if (/stock/i.test(msg)) return "stock";
  if (/solde insuffisant/i.test(msg)) return "funds";
  if (/inventaire plein/i.test(msg)) return "full";
  if (/quantité maximale/i.test(msg)) return "max";
  if (/insuffisant/i.test(msg)) return "insufficient";
  return "failed";
}

/**
 * Les boutiques d'un monde, telles que les voit qui les visite : leurs
 * articles, mes personas qui peuvent acheter (avec leur solde) et ce que
 * chacun porte déjà, pour la revente. La RLS ne rend les boutiques fermées
 * qu'à qui gère l'économie ; achats et reventes sont tranchés par la base.
 *
 * `off` tant que le monde n'a pas l'économie, l'inventaire et l'option
 * Boutiques (`worldHasShops`) : rien d'autre n'est lu.
 */
export function useWorldShops(worldId: string, userId: string | null, canManage: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<"loading" | "off" | "on">("loading");
  const [units, setUnits] = useState<CurrencyUnit[]>(DEFAULT_CURRENCY_UNITS);
  const [shops, setShops] = useState<WorldShop[]>([]);
  const [articles, setArticles] = useState<ShopArticle[]>([]);
  const [buyers, setBuyers] = useState<Omit<ShopBuyer, "balance">[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [holdings, setHoldings] = useState<Record<string, number>>({});
  const [catalog, setCatalog] = useState<WorldCatalogItem[]>([]);
  const [categories, setCategories] = useState<WorldCatalogCategory[]>([]);

  const readShops = useCallback(
    () => supabase.from("world_shops").select(SHOP_COLUMNS).eq("world_id", worldId).order("sort_index", { ascending: true }),
    [supabase, worldId],
  );
  const readArticles = useCallback(
    () => supabase.from("world_shop_items").select(ITEM_COLUMNS).eq("world_id", worldId).order("sort_index", { ascending: true }),
    [supabase, worldId],
  );

  /** Soldes et possessions de mes personas : ce qu'un achat ou une revente change. */
  const readPurses = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const [{ data: wallets }, { data: held }] = await Promise.all([
        supabase.from("persona_wallets").select("persona_id, balance").in("persona_id", ids),
        supabase
          .from("persona_items")
          .select("persona_id, catalog_item_id, quantity")
          .in("persona_id", ids)
          .not("catalog_item_id", "is", null),
      ]);
      const nextBalances: Record<string, number> = {};
      for (const w of (wallets ?? []) as { persona_id: string; balance: number | string }[]) {
        nextBalances[w.persona_id] = Number(w.balance);
      }
      const nextHoldings: Record<string, number> = {};
      for (const h of (held ?? []) as { persona_id: string; catalog_item_id: string; quantity: number }[]) {
        nextHoldings[`${h.persona_id}:${h.catalog_item_id}`] = h.quantity;
      }
      setBalances(nextBalances);
      setHoldings(nextHoldings);
    },
    [supabase],
  );

  const reload = useCallback(async () => {
    const [{ data: s }, { data: a }] = await Promise.all([readShops(), readArticles()]);
    setShops((s ?? []) as WorldShop[]);
    setArticles((a ?? []) as unknown as ShopArticle[]);
  }, [readShops, readArticles]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const { data: world } = await supabase
        .from("worlds")
        .select("enable_economy, enable_inventory, enable_shops, currency_units")
        .eq("id", worldId)
        .maybeSingle();
      if (cancelled) return;
      const row = world as
        | { enable_economy?: boolean | null; enable_inventory?: boolean | null; enable_shops?: boolean | null; currency_units?: unknown }
        | null;
      if (!row || !worldHasShops(row)) {
        setStatus("off");
        return;
      }
      const [{ data: s }, { data: a }, { data: mine }, { data: entries }, { data: cats }] = await Promise.all([
        readShops(),
        readArticles(),
        userId
          ? supabase
              .from("personas")
              .select("id, name, avatar_url")
              .eq("world_id", worldId)
              .eq("user_id", userId)
              .eq("is_template", false)
              .is("deleted_at", null)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [] }),
        supabase
          .from("world_catalog_items")
          .select("id, world_id, type, name, description, icon, lucide_icon, image_url, rarity, stackable, max_quantity, properties, sort_index, category_id")
          .eq("world_id", worldId)
          .eq("type", "inventory")
          .is("deleted_at", null)
          .order("sort_index", { ascending: true }),
        canManage
          ? supabase
              .from("world_catalog_categories")
              .select("id, world_id, type, name, sort_index, column_index")
              .eq("world_id", worldId)
              .eq("type", "inventory")
              .order("sort_index", { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      const personas = (mine ?? []) as Omit<ShopBuyer, "balance">[];
      await readPurses(personas.map((p) => p.id));
      if (cancelled) return;
      setUnits(currencyUnitsOf(row.currency_units));
      setShops((s ?? []) as WorldShop[]);
      setArticles((a ?? []) as unknown as ShopArticle[]);
      setBuyers(personas);
      setCatalog((entries ?? []) as WorldCatalogItem[]);
      setCategories((cats ?? []) as WorldCatalogCategory[]);
      setStatus("on");
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId, userId, canManage, readShops, readArticles, readPurses]);

  const trade = useCallback(
    async (fn: "buy_shop_item" | "sell_shop_item", personaId: string, itemId: string, quantity: number): Promise<ShopResult> => {
      const { error } = await supabase.rpc(fn, { p_persona: personaId, p_shop_item: itemId, p_quantity: quantity });
      if (error) return { ok: false, error: errorOf(error) };
      const { data: a } = await readArticles();
      setArticles((a ?? []) as unknown as ShopArticle[]);
      await readPurses(buyers.map((b) => b.id));
      return { ok: true };
    },
    [supabase, readArticles, readPurses, buyers],
  );

  const buy = useCallback(
    (personaId: string, itemId: string, quantity: number) => trade("buy_shop_item", personaId, itemId, quantity),
    [trade],
  );
  const sell = useCallback(
    (personaId: string, itemId: string, quantity: number) => trade("sell_shop_item", personaId, itemId, quantity),
    [trade],
  );

  const personas = useMemo<ShopBuyer[]>(
    () => buyers.map((b) => ({ ...b, balance: balances[b.id] ?? 0 })),
    [buyers, balances],
  );
  const itemsOf = useCallback((shopId: string) => articles.filter((a) => a.shop_id === shopId), [articles]);
  const held = useCallback(
    (personaId: string, catalogItemId: string) => holdings[`${personaId}:${catalogItemId}`] ?? 0,
    [holdings],
  );

  return { status, units, shops, itemsOf, personas, held, catalog, categories, buy, sell, reload };
}
