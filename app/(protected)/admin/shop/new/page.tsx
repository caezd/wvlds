import { requireAdmin } from "@/lib/admin";
import { ShopItemForm } from "../_components/ShopItemForm";
import { createItem } from "../actions";

export default async function NewShopItemPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Nouvel article</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          L&apos;article sera immédiatement visible en boutique si &quot;Actif&quot; est coché.
        </p>
      </div>

      <ShopItemForm action={createItem} submitLabel="Créer l'article" />
    </div>
  );
}
