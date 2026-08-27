// app/(protected)/shop/page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getFeatureFlags } from "@/lib/featureFlags";
import ShopGrid from "./ShopGrid";
import { getTranslations } from "next-intl/server";

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
  const [t, supabase] = await Promise.all([getTranslations("shop"), createClient()]);

  // Les trois appels suivants ne dépendent que du client Supabase, pas les uns
  // des autres : ils étaient enchaînés en quatre allers-retours successifs.
  // Le drapeau est vérifié après coup — charger le catalogue d'une boutique
  // désactivée coûte une requête, la garder séquentielle en coûtait trois.
  const [flags, itemsRes, balRes] = await Promise.all([
    getFeatureFlags(supabase),
    supabase.rpc("shop_list_items"),
    supabase.from("gamification_balances").select("coins").single(),
  ]);
  if (!flags.shop) notFound();

  const { data: items, error: itemsErr } = itemsRes;

  // La boutique nécessite des RPCs et tables non encore provisionnés
  if (itemsErr) {
    console.warn("ShopPage: shop_list_items indisponible —", itemsErr.message);
    return (
      <div className="mx-auto w-full max-w-6xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
        </header>
        <p className="text-muted-foreground text-sm">
          {t("empty")}
        </p>
      </div>
    );
  }

  const initialCoins = balRes.data?.coins ?? 0;
  const initialItems: ShopItem[] = (items ?? []) as ShopItem[];

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <ShopGrid initialItems={initialItems} initialCoins={initialCoins} />
    </div>
  );
}

