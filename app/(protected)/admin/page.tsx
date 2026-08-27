import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { ShoppingBag, Users, ToggleLeft, Languages } from "lucide-react";
import { getTranslations } from "next-intl/server";

/** Titre d'onglet — sans lui la page héritait du « WVLDS » générique. */
export async function generateMetadata() {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

export default async function AdminDashboard() {
  await requireAdmin();
  const t = await getTranslations("admin");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/shop"
          className="flex items-center gap-4 rounded-xl border border-border-soft p-5 hover:bg-muted transition-colors"
        >
          <ShoppingBag className="h-8 w-8 text-muted-foreground" />
          <div>
            <div className="font-semibold">{t("shopCard")}</div>
            <div className="text-sm text-muted-foreground">
              {t("shopCardDesc")}
            </div>
          </div>
        </Link>

        <Link
          href="/admin/users"
          className="flex items-center gap-4 rounded-xl border border-border-soft p-5 hover:bg-muted transition-colors"
        >
          <Users className="h-8 w-8 text-muted-foreground" />
          <div>
            <div className="font-semibold">{t("usersCard")}</div>
            <div className="text-sm text-muted-foreground">
              {t("usersCardDesc")}
            </div>
          </div>
        </Link>

        <Link
          href="/admin/features"
          className="flex items-center gap-4 rounded-xl border border-border-soft p-5 hover:bg-muted transition-colors"
        >
          <ToggleLeft className="h-8 w-8 text-muted-foreground" />
          <div>
            <div className="font-semibold">{t("featuresCard")}</div>
            <div className="text-sm text-muted-foreground">
              {t("featuresCardDesc")}
            </div>
          </div>
        </Link>

        <Link
          href="/admin/translations"
          className="flex items-center gap-4 rounded-xl border border-border-soft p-5 hover:bg-muted transition-colors"
        >
          <Languages className="h-8 w-8 text-muted-foreground" />
          <div>
            <div className="font-semibold">{t("translationsCard")}</div>
            <div className="text-sm text-muted-foreground">
              {t("translationsCardDesc")}
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
