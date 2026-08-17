"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, Maximize2, Minimize2, Star } from "lucide-react";

import { WorldHeroCard } from "./WorldHeroCard";
import { WorldChatComposer } from "../chatrooms/WorldChatComposer";
import { WorldChatroomsGrid } from "../chatrooms/WorldChatroomsGrid";
import { WorldCategoryFolders } from "../chatrooms/WorldCategoryFolders";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { World, WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";
import type { AsidePersona } from "@/components/personas/WorldPersonaAsideClient";
import { saveWorldPrefs, toggleWorldFavorite } from "@/app/(protected)/w/actions";
import { cn } from "@/lib/utils";
import { resolveWorldHomeLayout, type WorldHomeWidgetId } from "./worldHomeWidgets";
import type { AnnouncementSize } from "./widgets/WorldAnnouncementWidget";

// Onglets secondaires — un seul est actif à la fois, chargés à la demande
// pour ne pas alourdir le bundle de la vue par défaut du monde.
const WorldWiki = dynamic(() => import("../wiki/WorldWiki").then((m) => m.WorldWiki));
const WorldSettingsView = dynamic(() => import("../settings/WorldSettingsView").then((m) => m.WorldSettingsView));
const RelationsCanvas = dynamic(() => import("../relations/RelationsCanvas").then((m) => m.RelationsCanvas));
const WorldCatalogue = dynamic(() => import("../catalogue/WorldCatalogue").then((m) => m.WorldCatalogue));
const WorldMap = dynamic(() => import("../map/WorldMap").then((m) => m.WorldMap));
const WorldTimeline = dynamic(() => import("../timeline/WorldTimeline").then((m) => m.WorldTimeline));
const WorldMembersPanel = dynamic(() => import("../members/WorldMembersPanel").then((m) => m.WorldMembersPanel));
const WorldPersonasPanel = dynamic(() => import("@/components/personas/WorldPersonasPanel").then((m) => m.WorldPersonasPanel));
const WorldStatsWidget = dynamic(() => import("./widgets/WorldStatsWidget").then((m) => m.WorldStatsWidget));
const WorldMembersOnlineWidget = dynamic(() => import("./widgets/WorldMembersOnlineWidget").then((m) => m.WorldMembersOnlineWidget));
const WorldAnnouncementWidget = dynamic(() => import("./widgets/WorldAnnouncementWidget").then((m) => m.WorldAnnouncementWidget));

type WorldPrefs = { main_expanded: boolean; is_favorite: boolean; wiki_sidebar_width?: number };

type HeroWorld = World & { owner_id: string };

type Room = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  last_poster_avatar_url?: string | null;
  unread_count: number;
  category_id?: string | null;
  timeline_date?: WorldTimelineDate | null;
};

export function WorldHome({
  world,
  worldId,
  userId,
  canAdmin,
  isShared,
  canEditTabs,
  canPost,
  initialRooms,
  initialPersonas,
  initialPrefs,
  view,
  initialCategoryId,
}: {
  world: HeroWorld;
  worldId: string;
  userId: string | null;
  canAdmin: boolean;
  isShared: boolean;
  canEditTabs: boolean;
  canPost: boolean;
  initialRooms: Room[];
  initialPersonas: AsidePersona[];
  initialPrefs: WorldPrefs | null;
  view?: string;
  initialCategoryId?: string | null;
}) {
  const { create_chatroom, world_map, world_catalogue, world_timeline } = useFeatureFlags();
  const router = useRouter();
  const t = useTranslations("worlds");
  const { setHideMobileHeader } = useMobileSidebar();

  // La vue par défaut du monde affiche désormais son propre WorldPanelHeader
  // (comme tous les autres onglets) — la barre mobile générique de AppShell
  // deviendrait redondante.
  useEffect(() => {
    setHideMobileHeader(true);
    return () => setHideMobileHeader(false);
  }, [setHideMobileHeader]);

  const hasTimeline = world_timeline && !!world.timeline_enabled && !!world.timeline_config;
  const _hasCatalogue = world_catalogue && (!!(world.restrict_inventory || world.restrict_skills) || canEditTabs);

  const [mainExpanded, setMainExpanded] = useState(initialPrefs?.main_expanded ?? false);
  const [isFavorite, setIsFavorite] = useState(initialPrefs?.is_favorite ?? false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(initialCategoryId ?? null);
  const homeLayout = resolveWorldHomeLayout(world.home_layout);

  const baseHref = `/w/${worldId}`;

  function closeView() {
    router.replace(baseHref, { scroll: false });
  }

  function handleSelectCategory(categoryId: string | null) {
    setSelectedCategoryId(categoryId);
    const url = categoryId ? `${baseHref}?category=${encodeURIComponent(categoryId)}` : baseHref;
    router.replace(url, { scroll: false });
  }

  function handleToggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    void toggleWorldFavorite(worldId, next);
  }

  function handleToggleExpand() {
    const next = !mainExpanded;
    setMainExpanded(next);
    void saveWorldPrefs(worldId, { main_expanded: next });
  }

  function renderWidget(id: WorldHomeWidgetId) {
    switch (id) {
      case "categories":
        return (
          <WorldCategoryFolders
            key={id}
            worldId={worldId}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={handleSelectCategory}
          />
        );
      case "composer":
        return canPost && create_chatroom ? (
          <WorldChatComposer
            key={id}
            worldId={worldId}
            timelineConfig={hasTimeline ? (world.timeline_config as WorldTimelineConfig) : undefined}
          />
        ) : null;
      case "chatrooms":
        return (
          <WorldChatroomsGrid
            key={id}
            worldId={worldId}
            initialRooms={initialRooms}
            categoryId={selectedCategoryId}
          />
        );
      case "stats":
        return <WorldStatsWidget key={id} worldId={worldId} />;
      case "members_online":
        return <WorldMembersOnlineWidget key={id} worldId={worldId} />;
      case "announcement":
        return (
          <WorldAnnouncementWidget
            key={id}
            worldId={worldId}
            canAdmin={canAdmin}
            html={world.announcement_html ?? null}
            size={(world.announcement_size as AnnouncementSize | null) ?? "md"}
          />
        );
      default:
        return null;
    }
  }

  const showCanvas = view === "canvas";
  const showCatalogue = view === "catalogue";
  const showWiki = view === "wiki";
  const showMap = view === "map";
  const showTimeline = view === "timeline";
  const showMembers = view === "members";
  const showPersonas = view === "personas";
  const showSettings = view === "settings" && canAdmin;

  return (
    <>
      {/* Contenu */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {showSettings ? (
          <WorldSettingsView
            world={world}
            onUpdated={(updated: World) => {
              Object.assign(world, updated);
              router.refresh();
            }}
          />
        ) : showMembers ? (
          <WorldMembersPanel
            worldId={worldId}
            ownerId={world.owner_id}
            canManage={canAdmin}
            isShared={isShared}
          />
        ) : showPersonas ? (
          <WorldPersonasPanel
            worldId={worldId}
            myPersonas={initialPersonas}
            restrictInventory={!!world.restrict_inventory}
            restrictSkills={!!world.restrict_skills}
            faceclaimsEnabled={world.enable_faceclaims !== false}
          />
        ) : showCanvas ? (
          <RelationsCanvas
            worldId={worldId}
            userId={userId ?? ""}
            canAdmin={canAdmin}
          />
        ) : showCatalogue ? (
          <WorldCatalogue
            worldId={worldId}
            canEdit={canEditTabs}
            inventoryEnabled={world.enable_inventory !== false}
            inventoryRestricted={!!world.restrict_inventory}
            skillsEnabled={world.enable_skills !== false}
            skillsRestricted={!!world.restrict_skills}
            faceclaimsEnabled={world.enable_faceclaims !== false}
          />
        ) : showWiki ? (
          <WorldWiki
            worldId={worldId}
            canEdit={canEditTabs}
            initialSidebarWidth={initialPrefs?.wiki_sidebar_width}
            label={world.wiki_label}
          />
        ) : showMap && world_map ? (
          <WorldMap
            worldId={worldId}
            userId={userId ?? ""}
            canEdit={canEditTabs}
          />
        ) : showTimeline && hasTimeline ? (
          <WorldTimeline
            worldId={worldId}
            rooms={initialRooms.map(r => ({ ...r, timeline_date: r.timeline_date ?? null }))}
            config={world.timeline_config as WorldTimelineConfig}
            onClose={closeView}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Header classique (comme les autres onglets d'un monde), qu'on
                soit en plein écran ou non — favoris + agrandir/réduire y
                vivent, avec le bouton menu mobile intégré, plutôt que flottés
                par-dessus la bannière. */}
            <WorldPanelHeader
              icon={<Home className="h-4 w-4 shrink-0 text-muted-foreground" />}
              title={world.name}
              right={
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleToggleFavorite}
                        aria-label={isFavorite ? t("hero.removeFavorite") : t("hero.addFavorite")}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-hoverCard",
                          isFavorite ? "text-yellow-500" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Star size={16} className={isFavorite ? "fill-current" : ""} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                      {isFavorite ? t("hero.removeFavorite") : t("hero.addFavorite")}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleToggleExpand}
                        aria-label={mainExpanded ? t("hero.collapse") : t("hero.expand")}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hoverCard hover:text-foreground"
                      >
                        {mainExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                      {mainExpanded ? t("hero.collapse") : t("hero.expand")}
                    </TooltipContent>
                  </Tooltip>
                </>
              }
            />
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="flex w-full flex-col gap-6">
                <div
                  className={
                    mainExpanded
                      ? ""
                      : "mx-auto w-full px-4 pt-4 [--world-content-max-width:36rem] lg:[--world-content-max-width:44rem] max-w-(--world-content-max-width)"
                  }
                >
                  <WorldHeroCard
                    world={world}
                    canAdmin={canAdmin}
                    isExpanded={mainExpanded}
                  />
                </div>
                <div className="mx-auto flex w-full flex-col gap-6 px-4 pb-4 [--world-content-max-width:36rem] lg:[--world-content-max-width:44rem] max-w-(--world-content-max-width)">
                  {homeLayout.map((id) => renderWidget(id))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
