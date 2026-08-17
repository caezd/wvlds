"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, GlobeLock, Star } from "lucide-react";

import { WorldHeroCard } from "./WorldHeroCard";
import { WorldChatComposer } from "../chatrooms/WorldChatComposer";
import { WorldChatroomsGrid } from "../chatrooms/WorldChatroomsGrid";
import { WorldCategoryFolders } from "../chatrooms/WorldCategoryFolders";
import { MobileDrawerOpenButton } from "@/components/sidebar/MobileDrawerOpenButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { World, WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";
import type { AsidePersona } from "@/components/personas/WorldPersonaAsideClient";
import { toggleWorldFavorite } from "@/app/(protected)/w/actions";
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
const WorldWikiShortcutsWidget = dynamic(() => import("./widgets/WorldWikiShortcutsWidget").then((m) => m.WorldWikiShortcutsWidget));
const WorldRecentPersonasWidget = dynamic(() => import("./widgets/WorldRecentPersonasWidget").then((m) => m.WorldRecentPersonasWidget));

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
  initialWikiSlug,
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
  initialWikiSlug?: string | null;
}) {
  const { create_chatroom, world_map, world_catalogue, world_timeline } = useFeatureFlags();
  const router = useRouter();
  const t = useTranslations("worlds");
  const { setHideMobileHeader } = useMobileSidebar();

  // La vue par défaut du monde a son propre bouton menu mobile, incrusté sur
  // la bannière — la barre mobile générique de AppShell deviendrait redondante.
  useEffect(() => {
    setHideMobileHeader(true);
    return () => setHideMobileHeader(false);
  }, [setHideMobileHeader]);

  const hasTimeline = world_timeline && !!world.timeline_enabled && !!world.timeline_config;
  const _hasCatalogue = world_catalogue && (!!(world.restrict_inventory || world.restrict_skills) || canEditTabs);

  const [isFavorite, setIsFavorite] = useState(initialPrefs?.is_favorite ?? false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(initialCategoryId ?? null);
  const homeLayout = resolveWorldHomeLayout(world.home_layout);
  // « Statistiques » a une position fixe (sous le titre, hors du panel) plutôt
  // que de suivre l'ordre du reste des widgets — sa présence dans home_layout
  // sert uniquement d'interrupteur affiché/masqué.
  const showStats = homeLayout.includes("stats");
  const panelWidgetIds = homeLayout.filter((id) => id !== "stats");
  // Personnalisation désactivée temporairement (voir HomeColorField dans
  // WorldSettingsView.tsx) — toujours les couleurs par défaut du thème,
  // même si world.home_body_color/home_panel_color est déjà enregistré. Le
  // panel reprend la même couleur que le body (pas de carte distincte).
  const bodyColor = "var(--background)";
  const panelColor = bodyColor;

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
      case "wiki_shortcuts":
        return <WorldWikiShortcutsWidget key={id} worldId={worldId} />;
      case "personas_recent":
        return <WorldRecentPersonasWidget key={id} worldId={worldId} />;
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
            initialSlug={initialWikiSlug}
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
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            style={{ backgroundColor: bodyColor }}
          >
            {/* Bannière en fond, collée au bord du content (pas de padding) —
                boutons incrustés au-dessus (menu mobile, favoris). Plus de
                header séparé ni d'option plein écran : la page d'accueil
                occupe désormais toujours toute la largeur. Le fond (image +
                fondu) remplit tout ce conteneur, dont la hauteur suit celle
                du bloc titre — le fondu se termine donc pile avant le panel,
                quelle que soit la longueur de la description/des stats. */}
            <div className="relative">
              <WorldHeroCard world={world} bodyColor={bodyColor} />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
                <MobileDrawerOpenButton className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/45" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleToggleFavorite}
                      aria-label={isFavorite ? t("hero.removeFavorite") : t("hero.addFavorite")}
                      className={cn(
                        "ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-black/30 backdrop-blur-sm transition-colors hover:bg-black/45",
                        isFavorite ? "text-yellow-400" : "text-white",
                      )}
                    >
                      <Star size={16} className={isFavorite ? "fill-current" : ""} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    {isFavorite ? t("hero.removeFavorite") : t("hero.addFavorite")}
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Titre + description, désormais du contenu de page normal
                  (plus superposés sur la bannière) — stats juste en dessous.
                  pt-40/56 réserve la hauteur visuelle de la bannière.
                  `relative` est nécessaire ici : sans position, ce bloc
                  statique se peindrait sous le fond absolu de WorldHeroCard
                  malgré son ordre plus tardif dans le DOM (règles
                  d'empilement CSS), le rendant invisible. */}
              <div className="relative w-full space-y-2 px-12 pb-4 pt-40 md:pt-56">
                <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {world.icon_url ? (
                    <Image src={world.icon_url} alt="" fill sizes="44px" className="object-cover" />
                  ) : world.visibility === "public" ? (
                    <Globe size={20} className="text-muted-foreground" />
                  ) : (
                    <GlobeLock size={20} className="text-muted-foreground" />
                  )}
                </span>
                <div>
                  <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
                    {world.name}
                  </h1>
                  {world.description && (
                    <p className="mt-1 max-w-xl text-sm text-muted-foreground">{world.description}</p>
                  )}
                </div>
                {showStats && <WorldStatsWidget worldId={worldId} />}
              </div>
            </div>

            <div className="px-12 pb-12">
              <div
                data-home-panel
                className="flex w-full flex-col gap-6 rounded-2xl"
                style={{ backgroundColor: panelColor }}
              >
                {panelWidgetIds.map((id) => renderWidget(id))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
