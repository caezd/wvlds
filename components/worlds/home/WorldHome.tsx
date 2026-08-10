"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { WorldHeroCard } from "./WorldHeroCard";
import { WorldChatComposer } from "../chatrooms/WorldChatComposer";
import { WorldChatroomsGrid } from "../chatrooms/WorldChatroomsGrid";
import { WorldCategoryFolders } from "../chatrooms/WorldCategoryFolders";
import type { World, WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import type { AsidePersona } from "@/components/personas/WorldPersonaAsideClient";
import { saveWorldPrefs, toggleWorldFavorite } from "@/app/(protected)/w/actions";

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

  const hasTimeline = world_timeline && !!world.timeline_enabled && !!world.timeline_config;
  const _hasCatalogue = world_catalogue && (!!(world.restrict_inventory || world.restrict_skills) || canEditTabs);

  const [mainExpanded, setMainExpanded] = useState(initialPrefs?.main_expanded ?? false);
  const [isFavorite, setIsFavorite] = useState(initialPrefs?.is_favorite ?? false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(initialCategoryId ?? null);

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
            onClose={closeView}
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
                  onToggleExpand={handleToggleExpand}
                  isFavorite={isFavorite}
                  onToggleFavorite={handleToggleFavorite}
                />
              </div>
              <div className="mx-auto flex w-full flex-col gap-6 px-4 pb-4 [--world-content-max-width:36rem] lg:[--world-content-max-width:44rem] max-w-(--world-content-max-width)">
                <WorldCategoryFolders
                  worldId={worldId}
                  selectedCategoryId={selectedCategoryId}
                  onSelectCategory={handleSelectCategory}
                />
                {canPost && create_chatroom && (
                  <WorldChatComposer
                    worldId={worldId}
                    timelineConfig={hasTimeline ? (world.timeline_config as WorldTimelineConfig) : undefined}
                  />
                )}
                <WorldChatroomsGrid
                  worldId={worldId}
                  initialRooms={initialRooms}
                  categoryId={selectedCategoryId}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
