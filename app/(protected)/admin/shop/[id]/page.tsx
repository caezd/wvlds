import { requireAdmin } from "@/lib/admin";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ShopItemForm } from "../_components/ShopItemForm";
import { updateItem } from "../actions";

export default async function EditShopItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: item } = await supabase
    .from("cosmetic_items")
    .select("*")
    .eq("id", id)
    .single();

  if (!item) notFound();

  const t = await getTranslations("admin");

  const action = updateItem.bind(null, id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("editItem")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5 font-mono">{item.key}</p>
      </div>

      <ShopItemForm item={item} action={action} submitLabel="Enregistrer" />
    </div>
  );
}
