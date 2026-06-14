// app/(protected)/shop/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getFeatureFlags } from "@/lib/featureFlags";
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
  const flags = await getFeatureFlags(supabase);
  if (!flags.shop) notFound();

  const { data: items, error: itemsErr } = await supabase.rpc("shop_list_items");

  // La boutique nécessite des RPCs et tables non encore provisionnés
  if (itemsErr) {
    console.warn("ShopPage: shop_list_items indisponible —", itemsErr.message);
    return (
      <div className="mx-auto w-full max-w-6xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Boutique</h1>
        </header>
        <p className="text-muted-foreground text-sm">
          La boutique n&apos;est pas encore disponible. Revenez plus tard !
        </p>
      </div>
    );
  }

  const { data: bal } = await supabase
    .from("gamification_balances")
    .select("coins")
    .single();

  const initialCoins = bal?.coins ?? 0;
  const initialItems: ShopItem[] = (items ?? []) as ShopItem[];

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <ShopGrid initialItems={initialItems} initialCoins={initialCoins} />
    </div>
  );
}

