import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { canEditContent, canMemberPost } from "@/lib/worldPermissions";
import { WorldHome } from "@/components/worlds/home/WorldHome";
import type { AsidePersona } from "@/components/personas/WorldPersonaAsideClient";
import { fetchSectionsByPersona } from "@/lib/personaSections";
import { getChatroomCategories, getChatroomsNav, getIsWorldAdmin, type WorldWithMembership } from "@/lib/currentRequest";
import { resolveWorldHomeGrid, widgetOptionValue } from "@/components/worlds/home/worldHomeGrid";
import type { RecentPersona } from "@/components/worlds/home/widgets/WorldRecentPersonasWidget";
import type { WikiPage } from "@/components/worlds/home/widgets/WorldWikiShortcutsWidget";

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
  // `getChatroomsNav` et `getIsWorldAdmin` sont mémoïsés pour la requête et
  // partagés avec `WorldSidebar`, monté par le layout : chacun ne part qu'une
  // fois, quel que soit le nombre de composants qui le réclame.
  const [initialRooms, canAdmin, worldPrefs, initialPersonas, initialCategories, widgetData] = await Promise.all([
    (async (): Promise<NavRoom[]> => {
      const rooms = (await getChatroomsNav(worldId)) as NavRoom[];
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
    getIsWorldAdmin(world.id, userId ?? null),
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
      // Consommées uniquement par l'onglet « Personas » (cf. WorldHome).
      // Sans ce garde, les trois requêtes ci-dessous (personas, puis sections,
      // puis champs) partaient aussi pour l'accueil, le wiki, la carte, les
      // membres… et leur résultat était jeté. Les `data` jsonb des champs
      // peuvent être volumineux.
      if (!userId || view !== "personas") return [];
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
    // Mémoïsé et partagé avec `WorldSidebar` : elles étaient chargées côté
    // serveur pour la barre latérale, puis **à nouveau côté client** par le bloc
    // « Catégories » de l'accueil, qui repartait d'un état vide.
    getChatroomCategories(worldId),
    // Données des widgets présents dans la grille — même motif : ils partaient
    // d'un état vide et chargeaient au montage, donc s'affichaient vides le
    // temps d'un aller-retour. On ne charge QUE les blocs réellement placés
    // dans la grille de ce monde, avec la limite configurée sur le bloc.
    (async (): Promise<{ recentPersonas?: RecentPersona[]; wikiPages?: WikiPage[] }> => {
      const items = resolveWorldHomeGrid(world.home_grid, world.home_layout, world.announcement_html);
      const personasItem = items.find((i) => i.widgetId === "personas_recent");
      const wikiItem = items.find((i) => i.widgetId === "wiki_shortcuts");
      if (!personasItem && !wikiItem) return {};

      const [personas, pages] = await Promise.all([
        personasItem
          ? supabase
            .from("personas")
            .select("id, user_id, name, avatar_url, faceclaim, frame:avatar_frame_id(asset_url)")
            .eq("world_id", worldId)
            .eq("is_template", false)
            .order("created_at", { ascending: false })
            .limit(widgetOptionValue("personas_recent", "limit", personasItem.options))
          : Promise.resolve({ data: null }),
        wikiItem
          ? supabase
            .from("world_wiki_pages")
            .select("id, title, slug, icon, updated_at")
            .eq("world_id", worldId)
            .eq("is_folder", false)
            .order("updated_at", { ascending: false })
            .limit(widgetOptionValue("wiki_shortcuts", "limit", wikiItem.options))
          : Promise.resolve({ data: null }),
      ]);

      return {
        ...(personasItem ? { recentPersonas: (personas.data ?? []) as unknown as RecentPersona[] } : {}),
        ...(wikiItem ? { wikiPages: (pages.data ?? []) as unknown as WikiPage[] } : {}),
      };
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
      initialCategories={initialCategories}
      initialWidgetData={widgetData}
      initialPersonas={initialPersonas}
      initialPrefs={worldPrefs}
      view={view}
      initialCategoryId={initialCategoryId}
      initialWikiSlug={initialWikiSlug}
    />
  );
}
