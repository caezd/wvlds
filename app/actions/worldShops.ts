"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { ERR_ARTICLE_EN_DOUBLE, ERR_INTROUVABLE, echecEnregistrement } from "@/lib/actionErrors";
import { idSchema, parseInput } from "@/lib/inputSchemas";
import {
  shopInputSchema,
  shopItemInputSchema,
  type ShopInput,
  type ShopItemInput,
  type WorldShop,
  type WorldShopItem,
} from "@/lib/worldShops";

/**
 * Les boutiques d'un monde (migration 249) : leur gestion. La RLS réserve
 * toute écriture à qui gère l'économie ; achats et reventes passent par les
 * RPC `buy_shop_item` / `sell_shop_item`, appelées depuis `useWorldShops`.
 *
 * Une écriture refusée par la RLS ne lève pas : elle ne touche aucune ligne.
 * Modifications et suppressions relisent donc les lignes touchées.
 */

const SHOP_COLUMNS = "id, world_id, name, description, lucide_icon, is_open, buyback_enabled, buyback_percent, sort_index";
const ITEM_COLUMNS = "id, shop_id, catalog_item_id, price, stock, buyback_price, sort_index";

/** Le rang qui suit le dernier : une nouvelle ligne va au bout. */
function nextIndex(rows: unknown): number {
  const last = (rows as { sort_index: number }[] | null)?.[0];
  return last ? last.sort_index + 1 : 0;
}

export async function addWorldShop(worldId: string, data: ShopInput) {
  const input = parseInput(z.strictObject({ worldId: idSchema, data: shopInputSchema }), { worldId, data });
  if (!input.ok) return { ok: false as const, error: input.error };
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("world_shops")
    .select("sort_index")
    .eq("world_id", worldId)
    .order("sort_index", { ascending: false })
    .limit(1);

  const { data: shop, error } = await supabase
    .from("world_shops")
    .insert({ world_id: worldId, ...input.data.data, sort_index: nextIndex(last) })
    .select(SHOP_COLUMNS)
    .single();
  if (error) return { ok: false as const, error: echecEnregistrement("addWorldShop", error) };
  return { ok: true as const, shop: shop as unknown as WorldShop };
}

export async function updateWorldShop(shopId: string, patch: Partial<ShopInput>) {
  const input = parseInput(
    z.strictObject({ shopId: idSchema, patch: shopInputSchema.partial() }),
    { shopId, patch },
  );
  if (!input.ok) return { ok: false as const, error: input.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("world_shops").update(input.data.patch).eq("id", shopId).select("id");
  if (error) return { ok: false as const, error: echecEnregistrement("updateWorldShop", error) };
  if (!data?.length) return { ok: false as const, error: ERR_INTROUVABLE };
  return { ok: true as const };
}

export async function deleteWorldShop(shopId: string) {
  const input = parseInput(idSchema, shopId);
  if (!input.ok) return { ok: false as const, error: input.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("world_shops").delete().eq("id", shopId).select("id");
  if (error) return { ok: false as const, error: echecEnregistrement("deleteWorldShop", error) };
  if (!data?.length) return { ok: false as const, error: ERR_INTROUVABLE };
  return { ok: true as const };
}

export async function addWorldShopItem(shopId: string, catalogItemId: string, data: ShopItemInput) {
  const input = parseInput(
    z.strictObject({ shopId: idSchema, catalogItemId: idSchema, data: shopItemInputSchema }),
    { shopId, catalogItemId, data },
  );
  if (!input.ok) return { ok: false as const, error: input.error };
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("world_shop_items")
    .select("sort_index")
    .eq("shop_id", shopId)
    .order("sort_index", { ascending: false })
    .limit(1);

  // `world_id` est posé par le déclencheur, d'après la boutique.
  const { data: item, error } = await supabase
    .from("world_shop_items")
    .insert({
      shop_id: shopId,
      catalog_item_id: catalogItemId,
      price: input.data.data.price,
      stock: input.data.data.stock ?? null,
      buyback_price: input.data.data.buyback_price ?? null,
      sort_index: nextIndex(last),
    })
    .select(ITEM_COLUMNS)
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false as const, error: ERR_ARTICLE_EN_DOUBLE };
    return { ok: false as const, error: echecEnregistrement("addWorldShopItem", error) };
  }
  return { ok: true as const, item: item as unknown as WorldShopItem };
}

export async function updateWorldShopItem(itemId: string, patch: Partial<ShopItemInput>) {
  const input = parseInput(
    z.strictObject({ itemId: idSchema, patch: shopItemInputSchema.partial() }),
    { itemId, patch },
  );
  if (!input.ok) return { ok: false as const, error: input.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("world_shop_items").update(input.data.patch).eq("id", itemId).select("id");
  if (error) return { ok: false as const, error: echecEnregistrement("updateWorldShopItem", error) };
  if (!data?.length) return { ok: false as const, error: ERR_INTROUVABLE };
  return { ok: true as const };
}

export async function removeWorldShopItem(itemId: string) {
  const input = parseInput(idSchema, itemId);
  if (!input.ok) return { ok: false as const, error: input.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("world_shop_items").delete().eq("id", itemId).select("id");
  if (error) return { ok: false as const, error: echecEnregistrement("removeWorldShopItem", error) };
  if (!data?.length) return { ok: false as const, error: ERR_INTROUVABLE };
  return { ok: true as const };
}
