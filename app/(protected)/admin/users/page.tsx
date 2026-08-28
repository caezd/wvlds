import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import Image from "next/image";
import { Shield, ShieldOff, Heart } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PlanSelect, PLANS } from "./PlanSelect";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/hint";
import { getPatreonMinCents } from "@/lib/patreon/config";

async function toggleAdmin(userId: string, isAdmin: boolean) {
  "use server";
  // requireAdmin() = garde d'accès (rôle authenticated). L'écriture des colonnes
  // privilégiées (verrouillées pour authenticated depuis la migration 089) passe
  // par le service_role, qui contourne la RLS.
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_admin: isAdmin })
    .eq("id", userId);
  // Accorder ou retirer le rôle admin sans le dire en cas d'échec est
  // particulièrement trompeur : `revalidatePath` réaffiche l'ancien état et
  // l'administrateur croit son action passée.
  if (error) throw new Error(`Modification du rôle administrateur impossible : ${error.message}`);
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
  const { error } = await admin
    .from("profiles")
    .update({ plan, patreon_managed: false })
    .eq("id", userId);
  if (error) throw new Error(`Changement de plan impossible : ${error.message}`);
  revalidatePath("/admin/users");
}

export default async function AdminUsersPage() {
  const { supabase, user: adminUser } = await requireAdmin();
  const t = await getTranslations("admin");
  const minCents = getPatreonMinCents();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, plan, is_admin, avatar_url, patreon_managed")
    .order("username");

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Erreur : {error.message}
      </div>
    );
  }

  // patreon_accounts est verrouillée par RLS à "sa propre ligne" pour
  // authenticated (migration 088) : lecture de TOUS les comptes via service_role.
  const admin = createAdminClient();
  const { data: patreonRows } = await admin
    .from("patreon_accounts")
    .select("user_id, patron_status, entitled_cents");
  const patreonByUser = new Map(
    (patreonRows ?? []).map((r) => [r.user_id as string, r]),
  );

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
              <th className="px-4 py-3 text-left">{t("users.colPatreon")}</th>
              <th className="px-4 py-3 text-center">{t("users.colAdmin")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {(profiles ?? []).map((p) => {
              const isSelf = p.id === adminUser.id;
              const patreon = patreonByUser.get(p.id);
              const isActivePatron = patreon?.patron_status === "active_patron";
              const meetsThreshold = (patreon?.entitled_cents ?? 0) >= minCents;
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
                    <div className="flex items-center gap-1.5">
                      <PlanSelect
                        userId={p.id}
                        currentPlan={p.plan ?? "free"}
                        action={setUserPlan.bind(null, p.id)}
                      />
                      {p.patreon_managed && (
                        <Hint content={t("users.patreonManagedHint")} side="right">
                          <Heart className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </Hint>
                      )}
                    </div>
                  </td>

                  {/* Patreon */}
                  <td className="px-4 py-3">
                    {patreon ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant={isActivePatron && meetsThreshold ? "default" : "secondary"}>
                          {isActivePatron
                            ? (meetsThreshold ? t("users.patreonActive") : t("users.patreonBelowThreshold"))
                            : t("users.patreonInactive")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          ${((patreon.entitled_cents ?? 0) / 100).toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("users.patreonNotLinked")}</span>
                    )}
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
