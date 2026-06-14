import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { ShoppingBag, Users, ToggleLeft } from "lucide-react";

export default async function AdminDashboard() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tableau de bord admin</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/shop"
          className="flex items-center gap-4 rounded-xl border border-border-soft p-5 hover:bg-muted transition-colors"
        >
          <ShoppingBag className="h-8 w-8 text-muted-foreground" />
          <div>
            <div className="font-semibold">Boutique</div>
            <div className="text-sm text-muted-foreground">
              Gérer les articles cosmétiques
            </div>
          </div>
        </Link>

        <Link
          href="/admin/users"
          className="flex items-center gap-4 rounded-xl border border-border-soft p-5 hover:bg-muted transition-colors"
        >
          <Users className="h-8 w-8 text-muted-foreground" />
          <div>
            <div className="font-semibold">Utilisateurs</div>
            <div className="text-sm text-muted-foreground">
              Gérer les rôles et plans
            </div>
          </div>
        </Link>

        <Link
          href="/admin/features"
          className="flex items-center gap-4 rounded-xl border border-border-soft p-5 hover:bg-muted transition-colors"
        >
          <ToggleLeft className="h-8 w-8 text-muted-foreground" />
          <div>
            <div className="font-semibold">Fonctionnalités</div>
            <div className="text-sm text-muted-foreground">
              Activer ou désactiver des fonctionnalités
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
