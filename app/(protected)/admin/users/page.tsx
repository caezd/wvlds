import { requireAdmin } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { Button } from "@/components/ui/button";
import { Shield, ShieldOff } from "lucide-react";

async function toggleAdmin(userId: string, isAdmin: boolean) {
  "use server";
  const { supabase } = await requireAdmin();
  await supabase
    .from("profiles")
    .update({ is_admin: isAdmin })
    .eq("id", userId);
  revalidatePath("/admin/users");
}

async function setUserPlan(userId: string, plan: string) {
  "use server";
  const { supabase } = await requireAdmin();
  await supabase.from("profiles").update({ plan }).eq("id", userId);
  revalidatePath("/admin/users");
}

const PLANS = ["free", "pro", "team", "lifetime"] as const;

export default async function AdminUsersPage() {
  const { supabase, user: adminUser } = await requireAdmin();

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
        <h1 className="text-xl font-bold">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {profiles?.length ?? 0} profil(s)
        </p>
      </div>

      <div className="rounded-xl border border-border-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-soft bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Utilisateur</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-center">Admin</th>
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
                        <img
                          src={p.avatar_url}
                          alt=""
                          className="h-7 w-7 rounded-full object-cover bg-muted"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {(p.username ?? "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium">
                          {p.username ?? <span className="text-muted-foreground italic">Sans nom</span>}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                          {p.id}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Plan */}
                  <td className="px-4 py-3">
                    <form>
                      <select
                        name="plan"
                        defaultValue={p.plan ?? "free"}
                        onChange={async (e) => {
                          // handled via form action below
                        }}
                        className="text-sm bg-transparent border border-border-soft rounded px-2 py-1 cursor-pointer"
                        form={`plan-${p.id}`}
                      >
                        {PLANS.map((pl) => (
                          <option key={pl} value={pl}>{pl}</option>
                        ))}
                      </select>
                    </form>
                    <form
                      id={`plan-${p.id}`}
                      action={setUserPlan.bind(null, p.id, "")}
                      className="hidden"
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
                            ? "Vous ne pouvez pas modifier votre propre rôle"
                            : p.is_admin ? "Retirer le rôle admin" : "Accorder le rôle admin"
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
        Pour modifier le plan via le formulaire ci-dessus, changez la valeur puis soumettez.
        La modification du plan est immédiate côté serveur.
      </p>
    </div>
  );
}
