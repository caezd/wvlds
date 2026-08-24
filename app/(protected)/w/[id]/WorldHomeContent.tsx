import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { canEditContent, canMemberPost } from "@/lib/worldPermissions";
import { WorldHome } from "@/components/worlds/home/WorldHome";
import type { AsidePersona } from "@/components/personas/WorldPersonaAsideClient";
import { fetchSectionsByPersona } from "@/lib/personaSections";
import type { WorldWithMembership } from "@/lib/currentRequest";

type NavRoom = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  last_poster_avatar_url: string | null;
  unread_count: number;
  category_id: string | null;
  timeline_date?: { year: number; month: number | null; day: number | null } | null;
};

export default async function WorldHomeContent({
  world,
  worldId,
  myRole,
  view,
  initialCategoryId,
  initialWikiSlug,
}: {
  world: WorldWithMembership;
  worldId: string;
  myRole: string;
  view?: string;
  initialCategoryId: string | null;
  initialWikiSlug?: string | null;
}) {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const isShared = true; // guaranteed by the myRole guard in page.tsx
  const canEditTabs = canEditContent(myRole, world.owner_id === userId);
  const canPost = canMemberPost(myRole, world.owner_id === userId);

  // Ces quatre chargements (nav, droits admin, préférences UI, personas) sont
  // indépendants les uns des autres → on les exécute en parallèle plutôt que
  // d'enchaîner quatre allers-retours réseau séquentiels.
  const [initialRooms, canAdmin, worldPrefs, initialPersonas] = await Promise.all([
    (async (): Promise<NavRoom[]> => {
      const { data: navRooms } = await supabase.rpc("list_chatrooms_nav", {
        p_world_id: worldId,
      });
      const rooms = (navRooms as NavRoom[] | null) ?? [];
      if (!world?.timeline_enabled || rooms.length === 0) return rooms;
      const roomIds = rooms.map((r) => r.id);
      const { data: timelineDates } = await supabase
        .from("chatrooms")
        .select("id, timeline_date")
        .in("id", roomIds);
      if (!timelineDates) return rooms;
      const dateMap = new Map(timelineDates.map((r) => [r.id, r.timeline_date as NavRoom["timeline_date"]]));
      return rooms.map((r) => ({ ...r, timeline_date: dateMap.get(r.id) ?? null }));
    })(),
    (async (): Promise<boolean> => {
      const { data } = await supabase.rpc("is_world_admin", {
        wid: world.id,
        uid: userId ?? null,
      });
      return !!data;
    })(),
    (async (): Promise<{
      main_expanded: boolean;
      is_favorite: boolean;
      wiki_sidebar_width: number;
    } | null> => {
      if (!userId) return null;
      const { data } = await supabase
        .from("world_user_preferences")
        .select("main_expanded, is_favorite, wiki_sidebar_width")
        .eq("world_id", worldId)
        .eq("user_id", userId)
        .maybeSingle();
      return data as {
        main_expanded: boolean;
        is_favorite: boolean;
        wiki_sidebar_width: number;
      } | null;
    })(),
    (async (): Promise<AsidePersona[]> => {
      if (!userId) return [];
      const { data: personaRows } = await supabase
        .from("personas")
        .select(
          "id, name, avatar_url, avatar_config, banner_url, avatar_frame_id, faceclaim, marital_status, spouse_persona_id, frame:avatar_frame_id(asset_url)",
        )
        .eq("user_id", userId)
        .eq("world_id", worldId)
        .eq("is_template", false)
        .order("name", { ascending: true });

      const rows = (personaRows ?? []) as Omit<AsidePersona, "sections">[];
      if (rows.length === 0) return [];

      const sectionsByPersona = await fetchSectionsByPersona(
        supabase,
        rows.map((p) => p.id),
      );
      return rows.map((p) => ({
        ...p,
        sections: sectionsByPersona.get(p.id) ?? [],
      }));
    })(),
  ]);

  return (
    <WorldHome
      world={world}
      worldId={worldId}
      userId={userId ?? null}
      canAdmin={!!canAdmin}
      isShared={isShared}
      canEditTabs={canEditTabs}
      canPost={canPost}
      initialRooms={initialRooms}
      initialPersonas={initialPersonas}
      initialPrefs={worldPrefs}
      view={view}
      initialCategoryId={initialCategoryId}
      initialWikiSlug={initialWikiSlug}
    />
  );
}
