import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import Image from "next/image";
import { Shield, ShieldOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PlanSelect, PLANS } from "./PlanSelect";

async function toggleAdmin(userId: string, isAdmin: boolean) {
  "use server";
  // requireAdmin() = garde d'accès (rôle authenticated). L'écriture des colonnes
  // privilégiées (verrouillées pour authenticated depuis la migration 089) passe
  // par le service_role, qui contourne la RLS.
  await requireAdmin();
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ is_admin: isAdmin })
    .eq("id", userId);
  revalidatePath("/admin/users");
}

async function setUserPlan(userId: string, formData: FormData) {
  "use server";
  const raw = formData.get("plan");
  const plan = (PLANS as readonly string[]).includes(raw as string) ? (raw as (typeof PLANS)[number]) : "free";
  // Idem : garde admin + écriture privilégiée via service_role. On repasse le
  // plan sous contrôle manuel (patreon_managed = false) pour que la synchro
  // Patreon n'écrase pas ce choix.
  await requireAdmin();
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ plan, patreon_managed: false })
    .eq("id", userId);
  revalidatePath("/admin/users");
}

export default async function AdminUsersPage() {
  const { supabase, user: adminUser } = await requireAdmin();
  const t = await getTranslations("admin");

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, plan, is_admin, avatar_url")
    .order("username");

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Erreur : {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("users.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("users.count", { count: profiles?.length ?? 0 })}
        </p>
      </div>

      <div className="rounded-xl border border-border-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-soft bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left">{t("users.colUser")}</th>
              <th className="px-4 py-3 text-left">{t("users.colPlan")}</th>
              <th className="px-4 py-3 text-center">{t("users.colAdmin")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {(profiles ?? []).map((p) => {
              const isSelf = p.id === adminUser.id;
              return (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.avatar_url ? (
                        <Image
                          src={p.avatar_url}
                          alt=""
                          width={28}
                          height={28}
                          className="h-7 w-7 rounded-full object-cover bg-muted"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {(p.username ?? "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium">
                          {p.username ?? <span className="text-muted-foreground italic">{t("users.noName")}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                          {p.id}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Plan */}
                  <td className="px-4 py-3">
                    <PlanSelect
                      userId={p.id}
                      currentPlan={p.plan ?? "free"}
                      action={setUserPlan.bind(null, p.id)}
                    />
                  </td>

                  {/* Toggle admin */}
                  <td className="px-4 py-3 text-center">
                    <form action={toggleAdmin.bind(null, p.id, !p.is_admin)}>
                      <button
                        type="submit"
                        disabled={isSelf}
                        title={
                          isSelf
                            ? t("users.cantEditSelf")
                            : p.is_admin ? t("users.removeAdmin") : t("users.grantAdmin")
                        }
                        className="inline-flex items-center justify-center rounded p-1.5 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {p.is_admin
                          ? <Shield className="h-4 w-4 text-primary" />
                          : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("users.planInfo")}
      </p>
    </div>
  );
}
