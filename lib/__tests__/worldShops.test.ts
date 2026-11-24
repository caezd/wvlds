import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  MAX_SHOP_PRICE,
  MAX_SHOP_STOCK,
  MAX_SHOP_NAME_LENGTH,
  MAX_SHOP_DESCRIPTION_LENGTH,
  buybackPriceOf,
  maxPurchasable,
  shopInputSchema,
  shopItemInputSchema,
  worldHasShops,
} from "@/lib/worldShops";
import { MAX_CURRENCY_VALUE } from "@/lib/worldCurrency";
import { MAX_ITEM_QUANTITY } from "@/lib/personaInventory";

const shop = { buyback_enabled: true, buyback_percent: 50 as number | null };
const item = { price: 101, stock: null as number | null, buyback_price: null as number | null };

describe("buybackPriceOf", () => {
  it("rien sans l'option de revente", () => {
    expect(buybackPriceOf({ ...shop, buyback_enabled: false }, { ...item, buyback_price: 10 })).toBeNull();
  });

  it("le prix de rachat de l'article l'emporte sur le pourcentage", () => {
    expect(buybackPriceOf(shop, { ...item, buyback_price: 7 })).toBe(7);
    expect(buybackPriceOf(shop, { ...item, buyback_price: 0 })).toBe(0);
  });

  it("à défaut, un pourcentage du prix, arrondi à l'unité inférieure", () => {
    expect(buybackPriceOf(shop, item)).toBe(50);
  });

  it("ni prix de rachat ni pourcentage : la boutique ne rachète pas cet article", () => {
    expect(buybackPriceOf({ ...shop, buyback_percent: null }, item)).toBeNull();
  });
});

describe("maxPurchasable", () => {
  it("borné par le solde", () => {
    expect(maxPurchasable({ ...item, price: 30 }, 100)).toBe(3);
  });

  it("borné par le stock", () => {
    expect(maxPurchasable({ ...item, price: 1, stock: 2 }, 100)).toBe(2);
  });

  it("un article gratuit et illimité s'arrête à la quantité maximale d'un objet", () => {
    expect(maxPurchasable({ ...item, price: 0 }, 0)).toBe(MAX_ITEM_QUANTITY);
  });

  it("épuisé ou trop cher : zéro", () => {
    expect(maxPurchasable({ ...item, stock: 0 }, 1000)).toBe(0);
    expect(maxPurchasable(item, 100)).toBe(0);
  });
});

describe("schémas de saisie", () => {
  it("une boutique : nom requis, pourcentage entre 0 et 100", () => {
    expect(shopInputSchema.safeParse({ name: "  Forge  " }).data?.name).toBe("Forge");
    expect(shopInputSchema.safeParse({ name: " " }).success).toBe(false);
    expect(shopInputSchema.safeParse({ name: "x".repeat(MAX_SHOP_NAME_LENGTH + 1) }).success).toBe(false);
    expect(shopInputSchema.safeParse({ name: "F", description: "x".repeat(MAX_SHOP_DESCRIPTION_LENGTH + 1) }).success).toBe(false);
    expect(shopInputSchema.safeParse({ name: "F", buyback_percent: 101 }).success).toBe(false);
    expect(shopInputSchema.safeParse({ name: "F", buyback_percent: null, buyback_enabled: true }).success).toBe(true);
    expect(shopInputSchema.safeParse({ name: "F", lucide_icon: "Pas Une Icône" }).success).toBe(false);
    expect(shopInputSchema.safeParse({ name: "F", extra: 1 }).success).toBe(false);
  });

  it("un article : prix, stock et rachat bornés comme en base", () => {
    expect(shopItemInputSchema.safeParse({ price: 0, stock: null, buyback_price: null }).success).toBe(true);
    expect(shopItemInputSchema.safeParse({ price: -1 }).success).toBe(false);
    expect(shopItemInputSchema.safeParse({ price: MAX_SHOP_PRICE + 1 }).success).toBe(false);
    expect(shopItemInputSchema.safeParse({ price: 1, stock: MAX_SHOP_STOCK + 1 }).success).toBe(false);
    expect(shopItemInputSchema.safeParse({ price: 1.5 }).success).toBe(false);
    expect(shopItemInputSchema.safeParse({ price: 1, buyback_price: MAX_SHOP_PRICE + 1 }).success).toBe(false);
  });
});

describe("migration 249", () => {
  const sql = readFileSync(path.join(process.cwd(), "migrations/249_world_shops.sql"), "utf8");

  it("les bornes de la base sont celles de l'interface", () => {
    expect(MAX_SHOP_PRICE).toBe(MAX_CURRENCY_VALUE);
    expect(MAX_SHOP_STOCK).toBe(MAX_ITEM_QUANTITY);
    expect(sql).toContain(`price BETWEEN 0 AND ${MAX_SHOP_PRICE}`);
    expect(sql).toContain(`stock BETWEEN 0 AND ${MAX_SHOP_STOCK}`);
    expect(sql).toContain(`char_length(name) <= ${MAX_SHOP_NAME_LENGTH}`);
    expect(sql).toContain(`char_length(description) <= ${MAX_SHOP_DESCRIPTION_LENGTH}`);
    expect(sql).toContain("buyback_percent BETWEEN 0 AND 100");
  });

  it("le prix de rachat de la base suit la même règle", () => {
    expect(sql).toMatch(/coalesce\(\s*i\.buyback_price,\s*floor\(i\.price \* s\.buyback_percent \/ 100\.0\)/);
  });

  it("les achats et reventes passent par economy_apply, journalisés", () => {
    expect(sql).toContain("kind IN ('adjust', 'slots', 'purchase', 'sale')");
    expect(sql).toMatch(/economy_apply\([^;]*'purchase'/);
    expect(sql).toMatch(/economy_apply\([^;]*'sale'/);
  });

  it("une politique par action, écritures réservées à qui gère l'économie", () => {
    for (const table of ["world_shops", "world_shop_items"]) {
      for (const action of ["select", "insert", "update", "delete"]) {
        expect(sql).toContain(`CREATE POLICY ${table}_${action} ON public.${table}`);
      }
    }
    expect(sql.match(/'economy\.manage'/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });
});

describe("worldHasShops", () => {
  it("il faut l'économie, l'inventaire et l'option Boutiques", () => {
    expect(worldHasShops({ enable_economy: true, enable_inventory: true, enable_shops: true })).toBe(true);
    // L'inventaire est NOT NULL DEFAULT true : une colonne non chargée vaut activé.
    expect(worldHasShops({ enable_economy: true, enable_shops: true })).toBe(true);
    expect(worldHasShops({ enable_economy: false, enable_inventory: true, enable_shops: true })).toBe(false);
    expect(worldHasShops({ enable_economy: true, enable_inventory: false, enable_shops: true })).toBe(false);
    expect(worldHasShops({ enable_economy: true, enable_inventory: true, enable_shops: false })).toBe(false);
    expect(worldHasShops({ enable_economy: true, enable_inventory: true })).toBe(false);
    expect(worldHasShops(null)).toBe(false);
  });
});

describe("migration 250", () => {
  const sql = readFileSync(path.join(process.cwd(), "migrations/250_world_shops_option.sql"), "utf8");

  it("l'option est coupée par défaut, et la base la vérifie à chaque achat ou revente", () => {
    expect(sql).toMatch(/enable_shops\s+boolean\s+NOT NULL DEFAULT false/);
    expect(sql).toMatch(/w\.enable_economy AND w\.enable_inventory AND w\.enable_shops/);
  });
});
