import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WorldsSidebarClient from "./WorldsSidebarClient";
import { getUserQuotaServer } from "@/lib/userQuota";
import { UserMenuButton } from "./UserMenuButton";

type WorldRow = {
  id: string;
  name: string;
  slug: string | null;
  is_archived: boolean;
  owner_id: string;
  icon_url: string | null;
  banner_url: string | null;
  world_members: {
    user_id: string;
    role: "owner" | "admin" | "editor" | "player" | "viewer";
  }[];
};

type FavoriteRoom = {
  id: string;
  name: string | null;
  title: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  has_unread: boolean;
};

type FavoriteWorldRow = WorldRow & { chatrooms: FavoriteRoom[] };

export default async function Sidebar() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
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
      `id, name, slug, is_archived, owner_id, icon_url, banner_url,
       world_members ( user_id, role )`,
    )
    .is("deleted_at", null)
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

  // ── Mondes favoris + dernières chatrooms ─────────────────────
  const { data: favoritePrefs } = await supabase
    .from("world_user_preferences")
    .select("world_id")
    .eq("user_id", user.id)
    .eq("is_favorite", true);

  const favoriteWorldIds = (favoritePrefs ?? []).map((p) => p.world_id as string);
  const favoriteBaseWorlds = (worlds ?? []).filter((w) =>
    favoriteWorldIds.includes(w.id),
  );

  const favorites: FavoriteWorldRow[] = await Promise.all(
    favoriteBaseWorlds.map(async (w) => {
      const { data: rooms } = await supabase.rpc("list_participated_chatrooms", {
        p_world_id: w.id,
        p_limit: 3,
      });
      return {
        ...w,
        chatrooms: (rooms as FavoriteRoom[] | null) ?? [],
      };
    }),
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
          favorites={favorites}
          isAdmin={adminFlag}
        />
      </div>

      {/* Footer — user menu, fixé en bas du flex */}
      <div className="shrink-0 px-1 py-1.5 border-t border-border-soft">
        <UserMenuButton
          userId={user.id}
          username={profile?.username ?? null}
          email={user.email ?? ""}
          avatarUrl={profile?.avatar_url ?? null}
          plan={plan}
        />
      </div>
    </>
  );
}
