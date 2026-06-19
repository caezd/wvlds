import { createClient } from "@/lib/supabase/server";
import { Users, ShoppingBasket, ShieldCheck } from "lucide-react";
import { RailIcon, WorldIcon, EmptyWorldsIcon, CreateWorldRailButton } from "./SidebarRailIcons";
import { UserMenuButton } from "./UserMenuButton";
import { getUserQuotaServer } from "@/lib/userQuota";
import { getFeatureFlags } from "@/lib/featureFlags";

type FavoriteRoom = {
  id: string;
  name: string | null;
  title: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  has_unread: boolean;
};

export default async function SidebarRail() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let worlds: { id: string; name: string; icon_url: string | null }[] = [];
  let adminFlag = false;
  let profileData: { username: string | null; plan: string | null; avatar_url: string | null } | null = null;
  const chatroomsMap: Record<string, FavoriteRoom[]> = {};

  let quota: Awaited<ReturnType<typeof getUserQuotaServer>> = { plan: "free", owned: 0, quotaLimit: 1, quotaReached: false };

  const featureFlags = await getFeatureFlags(supabase);

  if (user) {
    const [{ data: worldData }, { data: profile }, q, { data: favoritePrefs }] = await Promise.all([
      supabase.from("worlds").select("id, name, icon_url").order("name"),
      supabase.from("profiles").select("is_admin, username, plan, avatar_url").eq("id", user.id).single(),
      getUserQuotaServer("worlds"),
      supabase.from("world_user_preferences").select("world_id").eq("user_id", user.id).eq("is_favorite", true),
    ]);
    worlds = worldData ?? [];
    adminFlag = profile?.is_admin === true;
    profileData = profile
      ? { username: profile.username ?? null, plan: profile.plan ?? null, avatar_url: profile.avatar_url ?? null }
      : null;
    quota = q;

    const favoriteWorldIds = (favoritePrefs ?? []).map((p) => p.world_id as string);
    if (favoriteWorldIds.length > 0) {
      const results = await Promise.all(
        favoriteWorldIds.map((wId) =>
          supabase
            .rpc("list_participated_chatrooms", { p_world_id: wId, p_limit: 3 })
            .then(({ data }) => ({ wId, rooms: (data as FavoriteRoom[] | null) ?? [] })),
        ),
      );
      for (const { wId, rooms } of results) {
        chatroomsMap[wId] = rooms;
      }
    }
  }

  return (
    <div className="flex flex-col items-center h-full w-full gap-0.5">

      {/* -- 1. Navigation -------------------------------- */}
      <div className="flex flex-col items-center gap-0.5 w-full pt-1 pb-0.5 px-1.5">
        <RailIcon href="/p" label="Personas">
          <Users size={17} />
        </RailIcon>
        {featureFlags.shop && (
          <RailIcon href="/shop" label="Boutique">
            <ShoppingBasket size={17} />
          </RailIcon>
        )}
        {adminFlag && (
          <RailIcon href="/admin" label="Administration">
            <ShieldCheck size={17} />
          </RailIcon>
        )}
      </div>

      {/* -- 2. Séparateur -------------------------------- */}
      <div className="w-6 border-t border-border-soft my-1 shrink-0" />

      {/* -- 3. Mondes (flex-1, scrollable) --------------- */}
      <div className="flex flex-col items-center gap-0.5 overflow-y-auto flex-1 w-full px-1.5 [scrollbar-width:none]">
        {worlds.map((w) => (
          <WorldIcon
            key={w.id}
            id={w.id}
            name={w.name}
            iconUrl={w.icon_url}
            chatrooms={chatroomsMap[w.id] ?? []}
          />
        ))}
        {worlds.length === 0 && <EmptyWorldsIcon />}
      </div>

      {/* -- 4. Footer ------------------------------------ */}
      <div className="w-6 border-t border-border-soft my-1 shrink-0" />
      {user && (
        <div className="flex flex-col items-center gap-0.5 w-full pb-2 pt-0.5 px-1.5">
          <CreateWorldRailButton
            disabled={quota.quotaReached}
            plan={quota.plan}
            ownedCount={quota.owned}
            quotaLimit={quota.quotaLimit}
          />
          <UserMenuButton
            variant="compact"
            userId={user.id}
            username={profileData?.username ?? null}
            email={user.email ?? ""}
            avatarUrl={profileData?.avatar_url ?? null}
            plan={profileData?.plan ?? null}
          />
        </div>
      )}

    </div>
  );
}
