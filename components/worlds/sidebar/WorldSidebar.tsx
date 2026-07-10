import { createClient } from "@/lib/supabase/server";
import { getCachedFeatureFlags, getCurrentUserId } from "@/lib/currentRequest";
import { getTranslations } from "next-intl/server";
import {
  BookOpenText,
  Clock,
  Home,
  Library,
  Map as MapIcon,
  Network,
  Settings,
  Users,
} from "lucide-react";
import { WorldSidebarChatrooms } from "./WorldSidebarChatrooms";
import { WorldSidebarNavLink } from "./WorldSidebarNavLink";
import { WorldPickerHeader, type WorldItem } from "@/components/sidebar/WorldPickerHeader";
import { MobileSidebarSlot } from "@/components/sidebar/MobileSidebarSlot";
import { getUserQuotaWithClient } from "@/lib/userQuota";

type Room = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  unread_count: number;
  category_id: string | null;
  last_poster_avatar_url: string | null;
  last_poster_id: string | null;
  participant_count: number;
  second_poster_avatar_url: string | null;
};

type ParticipatedRoom = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  has_unread: boolean;
};

type Category = {
  id: string;
  title: string;
  banner_url: string | null;
  icon_url: string | null;
  position: number;
};


export default async function WorldSidebar({ worldId }: { worldId: string }) {
  const supabase = await createClient();
  const [userId, featureFlags, t, tNav] = await Promise.all([
    getCurrentUserId(),
    getCachedFeatureFlags(),
    getTranslations("worlds"),
    getTranslations("nav"),
  ]);

  const [worldResult, roomsResult, participatedResult, canAdminResult, allWorldsResult, quota, categoriesResult, followedResult] =
    await Promise.all([
      supabase
        .from("worlds")
        .select("id, name, icon_url, owner_id, description, banner_url, color, visibility, restrict_inventory, restrict_skills, enable_inventory, enable_skills, enable_faceclaims, timeline_enabled")
        .eq("id", worldId)
        .single(),
      supabase.rpc("list_chatrooms_nav", { p_world_id: worldId }),
      userId
        ? supabase.rpc("list_participated_chatrooms", {
          p_world_id: worldId,
          p_limit: 20,
        })
        : Promise.resolve({ data: [] }),
      userId
        ? supabase.rpc("is_world_admin", { wid: worldId, uid: userId })
        : Promise.resolve({ data: false }),
      // Tous les mondes accessibles (membre ou propriétaire)
      userId
        ? supabase
          .from("worlds")
          .select("id, name, icon_url, owner_id, description, banner_url, color, visibility, restrict_inventory, restrict_skills, world_members!inner(user_id)")
          .eq("world_members.user_id", userId)
          .is("deleted_at", null)
          .eq("is_archived", false)
          .order("name")
        : Promise.resolve({ data: [] }),
      userId
        ? getUserQuotaWithClient(supabase, userId, "worlds")
        : Promise.resolve({ plan: "free" as const, owned: 0, quotaLimit: 1, quotaReached: false }),
      supabase
        .from("chatroom_categories")
        .select("id, title, banner_url, icon_url, position")
        .eq("world_id", worldId)
        .order("position"),
      userId
        ? supabase
          .from("chatroom_follows")
          .select("chatroom_id")
          .eq("user_id", userId)
        : Promise.resolve({ data: [] }),
    ]);

  const world = worldResult.data;
  if (!world) return null;

  const allRooms = (roomsResult.data ?? []) as Room[];
  const participated = (participatedResult.data ?? []) as ParticipatedRoom[];
  const canAdmin = !!canAdminResult.data;
  const categories = (categoriesResult.data ?? []) as Category[];
  const followedIds = ((followedResult.data ?? []) as { chatroom_id: string }[]).map((r) => r.chatroom_id);

  const hasCatalogue =
    featureFlags.world_catalogue &&
    (world.enable_inventory !== false || world.enable_skills !== false || world.enable_faceclaims !== false);
  const hasTimeline =
    featureFlags.world_timeline && !!world.timeline_enabled;

  const worldBase = `/w/${worldId}`;

  const allWorlds = (allWorldsResult.data ?? []) as WorldItem[];

  // S'assurer que le monde courant est dans la liste
  if (userId && !allWorlds.some((w) => w.id === worldId)) {
    allWorlds.unshift({
      id: world.id,
      name: world.name,
      icon_url: world.icon_url,
      owner_id: world.owner_id ?? "",
      description: world.description,
      banner_url: world.banner_url,
      color: world.color,
      visibility: world.visibility,
      restrict_inventory: world.restrict_inventory,
      restrict_skills: world.restrict_skills,
    });
  }

  const navLinks = (
    <div className="border-b py-3 mb-3">
      <WorldSidebarNavLink href={`${worldBase}`} icon={<Home size={14} />} label={t("nav.home")} />
      <WorldSidebarNavLink href={`${worldBase}?view=members`} icon={<Users size={14} />} label={t("nav.members")} />
      <WorldSidebarNavLink href={`${worldBase}?view=wiki`} icon={<BookOpenText size={14} />} label={t("nav.wiki")} />
      <WorldSidebarNavLink href={`${worldBase}?view=canvas`} icon={<Network size={14} />} label={t("nav.relations")} />
      {featureFlags.world_map && (
        <WorldSidebarNavLink href={`${worldBase}?view=map`} icon={<MapIcon size={14} />} label={t("nav.map")} />
      )}
      {hasTimeline && (
        <WorldSidebarNavLink href={`${worldBase}?view=timeline`} icon={<Clock size={14} />} label={t("nav.timeline")} />
      )}
      {hasCatalogue && (
        <WorldSidebarNavLink href={`${worldBase}?view=catalogue`} icon={<Library size={14} />} label={t("nav.catalogue")} />
      )}
      {canAdmin && (
        <WorldSidebarNavLink href={`${worldBase}?view=settings`} icon={<Settings size={14} />} label={tNav("settings")} />
      )}
    </div>
  );

  const pickerHeader = (
    <WorldPickerHeader
      worlds={allWorlds}
      currentWorldId={worldId}
      plan={quota.plan}
      ownedCount={quota.owned}
      quotaLimit={quota.quotaLimit}
    />
  );

  const chatrooms = (
    <WorldSidebarChatrooms
      worldId={worldId}
      initialAll={allRooms}
      initialParticipated={participated}
      initialFollowedIds={followedIds}
      categories={categories}
    />
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col overflow-hidden border-r border-border-soft p-2">
        {pickerHeader}
        {navLinks}
        {chatrooms}
      </aside>

      {/* Mobile: injecte la nav monde dans le drawer global */}
      <MobileSidebarSlot>
        <div className="flex flex-col h-full overflow-hidden p-2">
          {pickerHeader}
          {navLinks}
          {chatrooms}
        </div>
      </MobileSidebarSlot>
    </>
  );
}
