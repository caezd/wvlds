import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import type { WorldMembership } from "@/lib/worldPermissions";
import { WorldHome } from "@/components/worlds/home/WorldHome";
import type { AsidePersona } from "@/components/personas/WorldPersonaAsideClient";
import { EMBEDDED_SECTIONS_COLUMNS, fetchSectionsByPersona, normalizeEmbeddedSections } from "@/lib/personaSections";
import { getCachedFeatureFlags, getChatroomCategories, getChatroomsNav, type WorldWithMembership } from "@/lib/currentRequest";
import { resolveWorldPanel, SETTINGS_PERMISSIONS } from "@/components/worlds/home/worldView";
import { getWorldMaps } from "@/app/actions/worldMap";
import type { InitialWorldMap } from "@/components/worlds/map/WorldMap";
import { resolveWorldHomeGrid, widgetOptionValue } from "@/components/worlds/home/worldHomeGrid";
import type { RecentPersona } from "@/components/worlds/home/widgets/WorldRecentPersonasWidget";
import type { WikiPage } from "@/components/worlds/home/widgets/WorldWikiShortcutsWidget";
import { loadMapWidgetData, type MapWidgetMap } from "@/lib/worldMapWidget";
import { loadBirthdayMembers, type BirthdayMember } from "@/lib/worldBirthdays";

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
  membership,
  view,
  initialCategoryId,
  initialWikiSlug,
  initialMapId,
  initialPinId,
  initialPlayPinId,
}: {
  world: WorldWithMembership;
  worldId: string;
  membership: WorldMembership;
  view?: string;
  initialCategoryId: string | null;
  initialWikiSlug?: string | null;
  initialMapId?: string | null;
  initialPinId?: string | null;
  initialPlayPinId?: string | null;
}) {
  const supabase = await createClient();
  const [userId, flags] = await Promise.all([getUserId(supabase), getCachedFeatureFlags()]);

  const isShared = true; // garanti par la garde d'appartenance de page.tsx
  const permissions = [...membership.permissions];

  // Onglet réellement affiché — même règle que `WorldHome`. Les widgets de la
  // grille n'existent que sur l'accueil : sur le wiki, la carte, les membres…
  // leurs données (personas récents, pages, cartes, anniversaires) étaient
  // chargées puis jetées à chaque rendu.
  const panel = resolveWorldPanel(view, {
    enableWiki: world.enable_wiki,
    enableMap: world.enable_map,
    worldMapFlag: flags.world_map,
    hasTimeline: flags.world_timeline && !!world.timeline_enabled && !!world.timeline_config,
    canOpenSettings: SETTINGS_PERMISSIONS.some((perm) => membership.permissions.has(perm)),
  });

  // Ces chargements (nav, préférences UI, personas…) sont indépendants les uns
  // des autres → on les exécute en parallèle plutôt que d'enchaîner les
  // allers-retours réseau séquentiels.
  // `getChatroomsNav` est mémoïsé pour la requête et partagé avec
  // `WorldSidebar`, monté par le layout : il ne part qu'une fois, quel que soit
  // le nombre de composants qui le réclame.
  const [initialRooms, worldPrefs, initialPersonas, initialCategories, widgetData, initialMap] = await Promise.all([
    (async (): Promise<NavRoom[]> => {
      const rooms = (await getChatroomsNav(worldId)) as NavRoom[];
      if (!world?.timeline_enabled || rooms.length === 0) return rooms;
      // Depuis la migration 205, `list_chatrooms_nav` rend la date de
      // chronologie de chaque salon : plus de seconde requête en cascade.
      // La relecture ci-dessous ne sert qu'avant la migration, ou quand le
      // getter est retombé sur sa liste nue (RPC indisponible).
      if ("timeline_date" in rooms[0]) return rooms;
      const roomIds = rooms.map((r) => r.id);
      const { data: timelineDates } = await supabase
        .from("chatrooms")
        .select("id, timeline_date")
        .in("id", roomIds);
      if (!timelineDates) return rooms;
      const dateMap = new Map(timelineDates.map((r) => [r.id, r.timeline_date as NavRoom["timeline_date"]]));
      return rooms.map((r) => ({ ...r, timeline_date: dateMap.get(r.id) ?? null }));
    })(),
    (async (): Promise<{
      main_expanded: boolean;
      is_favorite: boolean;
      wiki_sidebar_width: number;
      wiki_panel_width: number;
    } | null> => {
      if (!userId) return null;
      const { data } = await supabase
        .from("world_user_preferences")
        .select("main_expanded, is_favorite, wiki_sidebar_width, wiki_panel_width")
        .eq("world_id", worldId)
        .eq("user_id", userId)
        .maybeSingle();
      return data as {
        main_expanded: boolean;
        is_favorite: boolean;
        wiki_sidebar_width: number;
        wiki_panel_width: number;
      } | null;
    })(),
    (async (): Promise<AsidePersona[]> => {
      // Consommées uniquement par l'onglet « Personas » (cf. WorldHome).
      // Sans ce garde, les trois requêtes ci-dessous (personas, puis sections,
      // puis champs) partaient aussi pour l'accueil, le wiki, la carte, les
      // membres… et leur résultat était jeté. Les `data` jsonb des champs
      // peuvent être volumineux.
      if (!userId || panel !== "personas") return [];
      const personaColumns =
        "id, name, avatar_url, avatar_config, banner_url, avatar_frame_id, faceclaim, marital_status, spouse_persona_id, narrative_status, review_status, sheet_complete, created_at, frame:avatar_frame_id(asset_url)";
      const personasQuery = (columns: string) =>
        supabase
          .from("personas")
          .select(columns)
          .eq("user_id", userId)
          .eq("world_id", worldId)
          .eq("is_template", false)
          .eq("is_npc", false)
          .order("name", { ascending: true });

      // Personas, sections et champs en UNE requête (jointures), au lieu de
      // trois successives (personas → sections → champs).
      const { data: embedded, error } = await personasQuery(
        `${personaColumns}, persona_sections(${EMBEDDED_SECTIONS_COLUMNS})`,
      );
      if (!error) {
        type Row = Omit<AsidePersona, "sections"> & { persona_sections?: unknown };
        return ((embedded ?? []) as unknown as Row[]).map(({ persona_sections, ...p }) => ({
          ...p,
          sections: normalizeEmbeddedSections(persona_sections),
        }));
      }

      // Repli : jointure refusée — l'ancien chargement en cascade.
      console.error("[WorldHomeContent] jointure des fiches refusée : %s", error.message);
      const { data: personaRows } = await personasQuery(personaColumns);
      const rows = (personaRows ?? []) as unknown as Omit<AsidePersona, "sections">[];
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
    (async (): Promise<{ recentPersonas?: RecentPersona[]; wikiPages?: WikiPage[]; maps?: MapWidgetMap[]; birthdays?: BirthdayMember[] }> => {
      if (panel !== "home") return {};
      const items = resolveWorldHomeGrid(world.home_grid, world.home_layout, world.announcement_html);
      const personasItem = items.find((i) => i.widgetId === "personas_recent");
      const wikiItem = items.find((i) => i.widgetId === "wiki_shortcuts");
      const birthdaysItem = items.find((i) => i.widgetId === "birthdays");
      // Le bloc « Carte » ne se charge pas pour un monde qui a coupé sa carte :
      // `WorldHome` ne le rendrait pas.
      const mapItem = world.enable_map !== false ? items.find((i) => i.widgetId === "map") : undefined;
      if (!personasItem && !wikiItem && !mapItem && !birthdaysItem) return {};

      const [personas, pages, maps, birthdays] = await Promise.all([
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
        mapItem ? loadMapWidgetData(supabase, worldId) : Promise.resolve(undefined),
        birthdaysItem ? loadBirthdayMembers(supabase, worldId) : Promise.resolve(undefined),
      ]);

      return {
        ...(personasItem ? { recentPersonas: (personas.data ?? []) as unknown as RecentPersona[] } : {}),
        ...(wikiItem ? { wikiPages: (pages.data ?? []) as unknown as WikiPage[] } : {}),
        ...(maps ? { maps } : {}),
        ...(birthdays ? { birthdays } : {}),
      };
    })(),
    // Cartes et épingles — comme les personas ci-dessus, uniquement quand c'est
    // l'onglet demandé. `WorldMap` les chargeait lui-même au montage : chunk
    // dynamique, puis hydratation, puis aller-retour, et un sablier pendant
    // tout ce temps alors que le serveur avait la réponse sous la main.
    (async (): Promise<InitialWorldMap | null> => {
      // Un monde qui a désactivé sa carte n'ouvre jamais cet onglet : la
      // requête ne servirait à rien.
      if (panel !== "map") return null;
      return getWorldMaps(worldId);
    })(),
  ]);

  return (
    <WorldHome
      world={world}
      worldId={worldId}
      userId={userId ?? null}
      permissions={permissions}
      isShared={isShared}
      initialRooms={initialRooms}
      initialCategories={initialCategories}
      initialWidgetData={widgetData}
      initialMap={initialMap}
      initialPersonas={initialPersonas}
      initialPrefs={worldPrefs}
      view={view}
      initialCategoryId={initialCategoryId}
      initialWikiSlug={initialWikiSlug}
      initialMapId={initialMapId}
      initialPinId={initialPinId}
      initialPlayPinId={initialPlayPinId}
    />
  );
}
