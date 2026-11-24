import { z } from "zod";

import { lucideIconSchema } from "@/lib/inputSchemas";
import { MAX_ITEM_QUANTITY } from "@/lib/personaInventory";
import { MAX_CURRENCY_VALUE } from "@/lib/worldCurrency";

/**
 * Les boutiques d'un monde (migration 249) : chacune vend des objets du
 * catalogue à un prix en monnaie du monde, avec un stock facultatif, et peut
 * racheter ce qu'elle vend.
 *
 * Fonctions pures, voir `lib/__tests__/worldShops.test.ts`. Les bornes sont
 * celles de la base, qui tranche en dernier ressort.
 */

export const MAX_SHOP_NAME_LENGTH = 80;
export const MAX_SHOP_DESCRIPTION_LENGTH = 1000;
/** Un prix ne dépasse pas la valeur maximale d'un palier de monnaie. */
export const MAX_SHOP_PRICE = MAX_CURRENCY_VALUE;
/** Un stock ne dépasse pas la quantité maximale d'un objet. */
export const MAX_SHOP_STOCK = MAX_ITEM_QUANTITY;

export type WorldShop = {
  id: string;
  world_id: string;
  name: string;
  description: string | null;
  lucide_icon: string | null;
  /** Fermée : visible de qui gère l'économie seulement. */
  is_open: boolean;
  buyback_enabled: boolean;
  /** Pourcentage du prix offert au rachat, à défaut d'un prix propre à l'article. */
  buyback_percent: number | null;
  sort_index: number;
};

export type WorldShopItem = {
  id: string;
  shop_id: string;
  catalog_item_id: string;
  price: number;
  /** `null` : illimité. */
  stock: number | null;
  /** Prix de rachat propre à l'article ; `null` : le pourcentage de la boutique. */
  buyback_price: number | null;
  sort_index: number;
};

type BuybackShop = Pick<WorldShop, "buyback_enabled" | "buyback_percent">;
type PricedItem = Pick<WorldShopItem, "price" | "stock" | "buyback_price">;

/**
 * Ce que la boutique paie pour un exemplaire revendu ; `null` si elle ne le
 * rachète pas. Miroir de `shop_buyback_price` (migration 249).
 */
export function buybackPriceOf(shop: BuybackShop, item: PricedItem): number | null {
  if (!shop.buyback_enabled) return null;
  if (item.buyback_price !== null) return item.buyback_price;
  if (shop.buyback_percent === null) return null;
  return Math.floor((item.price * shop.buyback_percent) / 100);
}

/** Combien d'exemplaires un solde permet d'acheter, dans la limite du stock. */
export function maxPurchasable(item: PricedItem, balance: number): number {
  let max = MAX_ITEM_QUANTITY;
  if (item.stock !== null) max = Math.min(max, item.stock);
  if (item.price > 0) max = Math.min(max, Math.floor(balance / item.price));
  return Math.max(0, max);
}

const amount = z.number().int().min(0).max(MAX_SHOP_PRICE);

export const shopInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(MAX_SHOP_NAME_LENGTH),
  description: z.string().trim().max(MAX_SHOP_DESCRIPTION_LENGTH).nullable().optional(),
  lucide_icon: lucideIconSchema.nullable().optional(),
  is_open: z.boolean().optional(),
  buyback_enabled: z.boolean().optional(),
  buyback_percent: z.number().int().min(0).max(100).nullable().optional(),
});
export type ShopInput = z.input<typeof shopInputSchema>;

export const shopItemInputSchema = z.strictObject({
  price: amount,
  stock: z.number().int().min(0).max(MAX_SHOP_STOCK).nullable().optional(),
  buyback_price: amount.nullable().optional(),
});
export type ShopItemInput = z.input<typeof shopItemInputSchema>;
