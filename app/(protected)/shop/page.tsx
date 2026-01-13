// app/(protected)/shop/page.tsx
import { createClient } from "@/lib/supabase/server";
import ShopGrid from "./ShopGrid";

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

export default async function ShopPage() {
  const supabase = await createClient();

  const { data: items, error: itemsErr } =
    await supabase.rpc("shop_list_items");
  if (itemsErr) {
    // En production, log + UI d’erreur adaptée à ton design.
    throw new Error(`shop_list_items failed: ${itemsErr.message}`);
  }

  const { data: bal, error: balErr } = await supabase
    .from("gamification_balances")
    .select("coins")
    .single();

  const initialCoins = bal?.coins ?? 0;
  const initialItems: ShopItem[] = (items ?? []) as ShopItem[];

  return (
    <div className="container mx-auto max-w-6xl py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Boutique</h1>
        <div className="text-sm text-muted-foreground">
          Solde:{" "}
          <span className="font-medium text-foreground">{initialCoins}</span>{" "}
          coins
        </div>
      </header>

      <ShopGrid initialItems={initialItems} initialCoins={initialCoins} />
    </div>
  );
}

/** Remplace Database par tes types si tu utilises des types générés Supabase. */
type Database = any;
