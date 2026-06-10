import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Eye, EyeOff, Trash2 } from "lucide-react";
import { toggleItem, deleteItem } from "./actions";

export default async function AdminShopPage() {
  const { supabase } = await requireAdmin();

  const { data: items, error } = await supabase
    .from("cosmetic_items")
    .select("*")
    .order("slot")
    .order("name");

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Erreur de chargement : {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Articles boutique</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {items?.length ?? 0} article(s) au total
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/shop/new">
            <Plus className="h-4 w-4 mr-1" />
            Nouvel article
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border border-border-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-soft bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Aperçu</th>
              <th className="px-4 py-3 text-left">Nom / Clé</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-right">Prix</th>
              <th className="px-4 py-3 text-center">Actif</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {(items ?? []).map((item) => (
              <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  {(item.preview_url || item.asset_url) ? (
                    <img
                      src={item.preview_url ?? item.asset_url}
                      alt={item.name}
                      className="h-10 w-10 rounded object-cover bg-muted"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{item.key}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{item.slot}</td>
                <td className="px-4 py-3 text-right font-mono">{item.price_coins}</td>
                <td className="px-4 py-3 text-center">
                  <form action={async () => {
                    "use server";
                    await toggleItem(item.id, !item.active);
                  }}>
                    <button
                      type="submit"
                      title={item.active ? "Masquer" : "Afficher"}
                      className="inline-flex items-center justify-center rounded p-1 hover:bg-muted"
                    >
                      {item.active
                        ? <Eye className="h-4 w-4 text-green-500" />
                        : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <Link href={`/admin/shop/${item.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <form action={async () => {
                      "use server";
                      await deleteItem(item.id);
                    }}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        type="submit"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}

            {(items ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  Aucun article. Créez votre premier article ci-dessus.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
