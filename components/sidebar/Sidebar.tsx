import { createClient } from "@/lib/supabase/server";
import WorldsSidebarClient from "./WorldsSidebarClient";
import { getUserQuotaServer } from "@/lib/userQuota";
import { ThemeSwitcher } from "../theme-switcher";
import { UserMenuButton } from "./UserMenuButton";

type WorldRow = {
  id: string;
  name: string;
  slug: string | null;
  is_archived: boolean;
  owner_id: string;
  world_members: {
    user_id: string;
    role: "owner" | "admin" | "editor" | "player" | "viewer";
  }[];
};

export default async function Sidebar() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Connecte-toi pour voir tes mondes.
      </div>
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username, plan, is_admin, avatar_url")
    .eq("id", user.id)
    .single();

  if (profileError) console.error("Sidebar profile error:", profileError.message);

  const { data: worlds, error } = (await supabase
    .from("worlds")
    .select(
      `id, name, slug, is_archived, owner_id,
       world_members ( user_id, role )`,
    )
    .order("name", { ascending: true })) as {
    data: WorldRow[] | null;
    error: unknown;
  };

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Erreur de chargement des mondes.
      </div>
    );
  }

  const { plan, owned, quotaLimit, quotaReached } =
    await getUserQuotaServer("worlds");

  const adminFlag = profile?.is_admin === true;

  const mine = (worlds ?? []).filter((w) =>
    w.world_members?.some((m) => m.user_id === user.id && m.role === "owner"),
  );
  const shared = (worlds ?? []).filter(
    (w) =>
      !w.world_members?.some(
        (m) => m.user_id === user.id && m.role === "owner",
      ),
  );

  return (
    <>
      {/* WorldsSidebarClient gère déjà : nav (Personae, Boutique),
          barre de recherche, séparateur, liste des mondes (flex-1)   */}
      <div className="flex-1 min-h-0">
        <WorldsSidebarClient
          meId={user.id}
          plan={plan}
          ownedCount={owned}
          quotaLimit={quotaLimit}
          quotaReached={quotaReached}
          mine={mine}
          shared={shared}
          isAdmin={adminFlag}
        />
      </div>

      {/* Footer — user menu + theme switcher, sticky en bas */}
      <div className="sticky bottom-0 z-30 px-1 py-1.5 border-t border-border-soft bg-token-bg-elevated-secondary">
        <div className="flex items-center gap-1">
          <div className="flex-1 min-w-0">
            <UserMenuButton
              username={profile?.username ?? null}
              email={user.email ?? ""}
              avatarUrl={profile?.avatar_url ?? null}
              plan={plan}
            />
          </div>
          <div className="shrink-0">
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </>
  );
}
