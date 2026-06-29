import { requireAdmin } from "@/lib/admin";
import { ShopItemForm } from "../_components/ShopItemForm";
import { createItem } from "../actions";
import { getTranslations } from "next-intl/server";

export default async function NewShopItemPage() {
  await requireAdmin();
  const t = await getTranslations("admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("shopItems.newTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("shopItems.newHint")}
        </p>
      </div>

      <ShopItemForm action={createItem} submitLabel="Créer l'article" />
    </div>
  );
}
