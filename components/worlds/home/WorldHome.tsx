"use client";

import { useLayoutEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, GlobeLock, Search, Star } from "lucide-react";

import { WorldHeroCard } from "./WorldHeroCard";
import { WorldHomeGridView } from "./WorldHomeGridView";
import { MobileDrawerOpenButton } from "@/components/sidebar/MobileDrawerOpenButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { World, WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";
import type { AsidePersona } from "@/components/personas/WorldPersonaAsideClient";
import { toggleWorldFavorite } from "@/app/(protected)/w/actions";
import { cn } from "@/lib/utils";
import { supabaseThumb } from "@/lib/storage";
import { compactHomeGridRows, resolveHomeGridGap, resolveWorldHomeGrid } from "./worldHomeGrid";
import { SearchCenter } from "@/components/chatrooms/search/SearchCenter";

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
  const tChat = useTranslations("chatrooms");
  const { setHideMobileHeader } = useMobileSidebar();

  // La vue par défaut du monde a son propre bouton menu mobile, incrusté sur
  // la bannière — la barre mobile générique de AppShell deviendrait redondante.
  //
  // `useLayoutEffect`, pas `useEffect` : AppShell.tsx masque cette barre
  // (h-12, shrink-0) uniquement une fois `hideMobileHeader` passé à true, un
  // rendu APRÈS le montage — avec `useEffect` (différé après la peinture du
  // navigateur), la première image peinte montrait encore la barre, avant
  // qu'une seconde image ne l'efface et n'étire le contenu dans l'espace
  // libéré (et l'inverse en quittant Accueil) : un bond de layout visible à
  // chaque bascule vers/depuis cette vue précisément. `useLayoutEffect`
  // s'exécute avant la peinture, donc dans la même image que le montage.
  useLayoutEffect(() => {
    setHideMobileHeader(true);
    return () => setHideMobileHeader(false);
  }, [setHideMobileHeader]);

  const hasTimeline = world_timeline && !!world.timeline_enabled && !!world.timeline_config;
  const _hasCatalogue = world_catalogue && (!!(world.restrict_inventory || world.restrict_skills) || canEditTabs);

  const [isFavorite, setIsFavorite] = useState(initialPrefs?.is_favorite ?? false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(initialCategoryId ?? null);
  // Le composer est retiré de la grille avant le calcul du layout (pas juste
  // au rendu) : sinon un visiteur sans droit de post verrait un trou vide à
  // la place du bloc plutôt qu'une grille recomposée sans lui. `compactHomeGridRows`
  // renumérote les lignes qui suivent pour combler le vide laissé par le
  // retrait — sans lui, un composer seul sur sa ligne (cas par défaut)
  // laissait la ligne vide et deux gouttières avant les blocs suivants.
  const gridItems = compactHomeGridRows(
    resolveWorldHomeGrid(world.home_grid, world.home_layout, world.announcement_html).filter(
      (item) => item.widgetId !== "composer" || (canPost && create_chatroom),
    ),
  );
  const gridGap = resolveHomeGridGap(world.home_grid_gap);
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
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {/* Pas de couleur de fond forcée ici (ni sur le panel plus bas) :
                ce conteneur reste transparent et laisse voir le fond ambiant
                réel de la page — celui-ci diffère entre desktop (`<main>`
                pose `lg:bg-background`, voir AppShell.tsx) et mobile (en
                dessous de `lg:`, c'est le fond du `<body>` qui doit rester
                visible). Peindre `var(--background)` en dur ici cassait
                justement ce second cas.

                Bannière en fond, collée au bord du content (pas de padding) —
                boutons incrustés au-dessus (menu mobile, favoris). Plus de
                header séparé ni d'option plein écran : la page d'accueil
                occupe désormais toujours toute la largeur. Le fond (image +
                fondu) remplit tout ce conteneur, dont la hauteur suit celle
                du bloc titre.

                Le dégradé (fondu d'opacité, voir WorldHeroCard.tsx) démarre à
                --hero-fade-start et devient transparent à 100% de ce
                conteneur, c'est-à-dire sous le bloc titre : il s'étire donc
                avec la description au lieu de se couper net. `min-h` garantit
                une présence minimale de la bannière pour un monde sans
                description. Hauteur réservée (pt-40) et début du fondu sont
                constants et déclarés ensemble — les avoir désaccordés
                (padding responsive, fondu fixe) coupait le fondu pile à
                767px, sans raison visible.

                `shrink-0` est indispensable : ce bloc et le panel sont des
                enfants d'un conteneur flex-col, donc compressibles par défaut.
                Dès que le contenu dépassait la hauteur du viewport, ce bloc
                était réduit sous sa hauteur naturelle ; son contenu (padding
                fixe + titre + description) débordait alors de la boîte, et le
                panel — qui démarre au bord inférieur de la boîte *réduite* —
                venait se superposer à la description. */}
            <div className="relative min-h-60 shrink-0 [--hero-fade-start:6rem]">
              <WorldHeroCard world={world} />
              {/* z-10 obligatoire : le bloc titre qui suit est `relative`, donc
                  positionné comme cette barre — à z-index égal, c'est le
                  dernier du DOM qui se peint au-dessus. Son `pt` (la hauteur
                  réservée à la bannière) recouvre alors exactement ces boutons
                  et, une zone de padding captant les événements pointeur, les
                  rendait inertes. */}
              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3">
                <MobileDrawerOpenButton className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/45" />
                <div className="ml-auto flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setSearchOpen(true)}
                        aria-label={tChat("search.title")}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/45"
                      >
                        <Search size={16} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>{tChat("search.title")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleToggleFavorite}
                        aria-label={isFavorite ? t("hero.removeFavorite") : t("hero.addFavorite")}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg bg-black/30 backdrop-blur-sm transition-colors hover:bg-black/45",
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
              </div>

              <SearchCenter worldId={worldId} open={searchOpen} onOpenChange={setSearchOpen} />

              {/* Titre + description, désormais du contenu de page normal
                  (plus superposés sur la bannière). `pt-40` réserve la hauteur
                  visuelle de la bannière — à garder en phase avec
                  --hero-fade-* du conteneur parent. `relative` est nécessaire
                  ici : sans position, ce bloc statique se peindrait sous le
                  fond absolu de WorldHeroCard malgré son ordre plus tardif
                  dans le DOM (règles d'empilement CSS), le rendant invisible.
                  Les statistiques ont une position fixe ici (pas un bloc de
                  la grille) — seul leur affichage se règle, depuis Réglages
                  > Page d'accueil (voir WorldHomeGridSettings.tsx). */}
              <div className="relative w-full space-y-2 px-3 pb-4 pt-40 sm:px-6 md:px-8 lg:px-12">
                <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {world.icon_url ? (
                    // `unoptimized` : `sizes` en px fixe (pas `vw`) fait
                    // demander à Next.js sa plus grande largeur configurée
                    // (jusqu'à 3840px) au lieu d'une taille adaptée — voir le
                    // commentaire détaillé dans WorldAvatar.tsx. On
                    // pré-dimensionne donc nous-mêmes via imgproxy.
                    <Image
                      src={supabaseThumb(world.icon_url, 44 * 3, 90) ?? world.icon_url}
                      alt=""
                      fill
                      unoptimized
                      className="object-cover"
                    />
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
                {world.home_show_stats && <WorldStatsWidget worldId={worldId} />}
              </div>
            </div>

            {/* Panel de contenu : accueille la grille de blocs configurée par
                l'admin (voir WorldHomeGridView / WorldHomeGridEditor).
                `shrink-0` pour la même raison que le bloc bannière ci-dessus —
                sans lui, la grille se ferait comprimer et son contenu
                déborderait de la boîte au lieu de faire défiler la page. */}
            <div className="shrink-0 px-3 pb-12 sm:px-6 md:px-8 lg:px-12">
              <div data-home-panel className="w-full rounded-2xl">
                <WorldHomeGridView
                  items={gridItems}
                  worldId={worldId}
                  canPost={canPost}
                  canCreateChatroom={create_chatroom}
                  timelineConfig={hasTimeline ? (world.timeline_config as WorldTimelineConfig) : undefined}
                  initialRooms={initialRooms}
                  selectedCategoryId={selectedCategoryId}
                  onSelectCategory={handleSelectCategory}
                  onWikiLink={(slug) => router.push(`${baseHref}?view=wiki&page=${encodeURIComponent(slug)}`)}
                  gap={gridGap}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
