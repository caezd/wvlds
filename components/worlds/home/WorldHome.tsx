"use client";

import { useState } from "react";
import { useResetOnKeyChange } from "@/hooks/useResetOnKeyChange";
import { useScrolledPast } from "@/hooks/useScrolledPast";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { WorldHeroCard } from "./WorldHeroCard";
import { WORLD_HOME_HEADER_HEIGHT, WorldHomeHeader, WorldHomeIcon } from "./WorldHomeHeader";
import { WorldHomeGridView } from "./WorldHomeGridView";
import type { ChatroomCategory } from "@/lib/currentRequest";
import type { RecentPersona } from "./widgets/WorldRecentPersonasWidget";
import type { WikiPage } from "./widgets/WorldWikiShortcutsWidget";
import type { MapWidgetMap } from "./widgets/WorldMapWidget";
import type { BirthdayMember } from "./widgets/WorldBirthdaysWidget";
import type { World, WorldTimelineConfig, WorldHomeRoom as Room } from "@/types/worlds";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import type { AsidePersona } from "@/components/personas/WorldPersonaAsideClient";
import type { InitialWorldMap } from "../map/WorldMap";
import { toggleWorldFavorite } from "@/app/(protected)/w/actions";
import { compactHomeGridRows, resolveHomeGridGap, resolveWorldHomeGrid } from "./worldHomeGrid";
import { permissionListHas, type WorldPermission } from "@/lib/worldPermissions";
// Modale rarement ouverte : même traitement que les onglets ci-dessous.
const SearchCenter = dynamic(() =>
  import("@/components/chatrooms/search/SearchCenter").then((m) => m.SearchCenter),
);

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

type WorldPrefs = {
  main_expanded: boolean;
  is_favorite: boolean;
  wiki_sidebar_width?: number;
  wiki_panel_width?: number;
};

type HeroWorld = World & { owner_id: string };

export function WorldHome({
  world,
  worldId,
  userId,
  permissions,
  isShared,
  initialRooms,
  initialCategories,
  initialWidgetData = {},
  initialMap,
  initialPersonas,
  initialPrefs,
  view,
  initialCategoryId,
  initialWikiSlug,
  initialMapId,
  initialPinId,
  initialPlayPinId,
}: {
  world: HeroWorld;
  worldId: string;
  userId: string | null;
  /** Permissions effectives du membre dans ce monde (cf. lib/worldPermissions). */
  permissions: readonly string[];
  isShared: boolean;
  initialRooms: Room[];
  /** Catégories chargées côté serveur, partagées avec WorldSidebar. */
  initialCategories?: ChatroomCategory[];
  /** Données des widgets d'accueil résolues côté serveur, quand le bloc est
   *  présent dans la grille (cf. WorldHomeContent). */
  initialWidgetData?: { recentPersonas?: RecentPersona[]; wikiPages?: WikiPage[]; maps?: MapWidgetMap[]; birthdays?: BirthdayMember[] };
  /** Cartes et épingles résolues côté serveur quand `view === "map"`. */
  initialMap?: InitialWorldMap | null;
  initialPersonas: AsidePersona[];
  initialPrefs: WorldPrefs | null;
  view?: string;
  initialCategoryId?: string | null;
  initialWikiSlug?: string | null;
  /** Carte et lieu à ouvrir, lus dans l'adresse (`?map=…&pin=…`). */
  initialMapId?: string | null;
  initialPinId?: string | null;
  /** Lieu sur lequel ouvrir le composeur d'emblée (`?play=…`, depuis la carte). */
  initialPlayPinId?: string | null;
}) {
  const { create_chatroom, world_map, world_catalogue, world_timeline } = useFeatureFlags();
  const router = useRouter();

  const can = (perm: WorldPermission) => permissionListHas(permissions, perm);
  const canPost = can("messages.post");
  const canOpenSettings =
    can("world.settings") || can("roles.manage") || can("categories.manage") || can("relations.manage");

  const hasTimeline = world_timeline && !!world.timeline_enabled && !!world.timeline_config;
  const _hasCatalogue = world_catalogue && (!!(world.restrict_inventory || world.restrict_skills) || can("catalog.edit"));

  const [isFavorite, setIsFavorite] = useState(initialPrefs?.is_favorite ?? false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(initialCategoryId ?? null);

  // La barre du haut se révèle en header (fond flouté, nom du monde) au
  // moment même où le titre de la page disparaît sous elle.
  // En état (refs de rappel), pas en ref : ces éléments sont remontés à
  // chaque retour d'une autre vue — voir useScrolledPast.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [titleEl, setTitleEl] = useState<HTMLHeadingElement | null>(null);
  const headerCondensed = useScrolledPast(titleEl, scrollEl, WORLD_HOME_HEADER_HEIGHT);

  // Passer d'un monde à l'autre depuis le rail est une navigation client :
  // ce composant n'est pas remonté et ses états gardent la valeur du monde
  // quitté. Sans ce resemis, l'étoile « favori » restait celle du monde
  // précédent, et une catégorie sélectionnée continuait de filtrer la grille
  // du nouveau monde alors que son identifiant n'y existe pas.
  useResetOnKeyChange(worldId, () => {
    setIsFavorite(initialPrefs?.is_favorite ?? false);
    setSelectedCategoryId(initialCategoryId ?? null);
  });

  // Le composer est retiré de la grille avant le calcul du layout (pas juste
  // au rendu) : sinon un visiteur sans droit de post verrait un trou vide à
  // la place du bloc plutôt qu'une grille recomposée sans lui. `compactHomeGridRows`
  // renumérote les lignes qui suivent pour combler le vide laissé par le
  // retrait — sans lui, un composer seul sur sa ligne (cas par défaut)
  // laissait la ligne vide et deux gouttières avant les blocs suivants.
  const gridItems = compactHomeGridRows(
    resolveWorldHomeGrid(world.home_grid, world.home_layout, world.announcement_html).filter(
      (item) => {
        if (item.widgetId === "composer") return canPost && create_chatroom;
        // Un bloc qui renvoie vers une section désactivée n'a plus rien à
        // montrer : ses liens retomberaient sur cette page. Le bloc n'est pas
        // retiré de la grille enregistrée — réactiver la section le fait
        // revenir à sa place.
        if (item.widgetId === "wiki_shortcuts") return world.enable_wiki !== false;
        if (item.widgetId === "map") return world_map && world.enable_map !== false;
        return true;
      },
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
  // Masquer le lien ne suffit pas : `?view=wiki` reste tapable dans la barre
  // d'adresse, et un lien partagé avant la désactivation continue de circuler.
  const showWiki = view === "wiki" && world.enable_wiki !== false;
  const showMap = view === "map" && world.enable_map !== false;
  const showTimeline = view === "timeline";
  const showMembers = view === "members";
  const showPersonas = view === "personas";
  const showSettings = view === "settings" && canOpenSettings;

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
            canManage={can("members.manage")}
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
            canAdmin={can("relations.manage")}
          />
        ) : showCatalogue ? (
          <WorldCatalogue
            worldId={worldId}
            canEdit={can("catalog.edit")}
            inventoryEnabled={world.enable_inventory !== false}
            inventoryRestricted={!!world.restrict_inventory}
            skillsEnabled={world.enable_skills !== false}
            skillsRestricted={!!world.restrict_skills}
            faceclaimsEnabled={world.enable_faceclaims !== false}
          />
        ) : showWiki ? (
          <WorldWiki
            worldId={worldId}
            canEdit={can("wiki.edit")}
            canComment={can("wiki.comment")}
            initialSidebarWidth={initialPrefs?.wiki_sidebar_width}
            initialPanelWidth={initialPrefs?.wiki_panel_width}
            label={world.wiki_label}
            initialSlug={initialWikiSlug}
          />
        ) : showMap && world_map ? (
          <WorldMap
            worldId={worldId}
            canEdit={can("map.edit")}
            canPost={canPost && create_chatroom}
            initialMap={initialMap}
            initialMapId={initialMapId}
            initialPinId={initialPinId}
            timelineConfig={hasTimeline ? (world.timeline_config as WorldTimelineConfig) : null}
          />
        ) : showTimeline && hasTimeline ? (
          <WorldTimeline
            worldId={worldId}
            rooms={initialRooms.map(r => ({ ...r, timeline_date: r.timeline_date ?? null }))}
            config={world.timeline_config as WorldTimelineConfig}
            onClose={closeView}
          />
        ) : (
          <div ref={setScrollEl} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {/* Pas de couleur de fond forcée ici (ni sur le panel plus bas) :
                ce conteneur reste transparent et laisse voir le fond ambiant
                réel de la page — celui-ci diffère entre desktop (`<main>`
                pose `lg:bg-background`, voir AppShell.tsx) et mobile (en
                dessous de `lg:`, c'est le fond du `<body>` qui doit rester
                visible). Peindre `var(--background)` en dur ici cassait
                justement ce second cas.

                Bannière en fond, collée au bord du content (pas de padding) —
                boutons incrustés au-dessus (menu mobile, recherche, favoris),
                dans une barre collante qui se révèle en header une fois le
                titre défilé (voir WorldHomeHeader.tsx). Plus de header séparé
                ni d'option plein écran : la page d'accueil occupe désormais
                toujours toute la largeur. Le fond (image + fondu) remplit tout
                ce conteneur, dont la hauteur suit celle de l'icône et du
                titre — la description vient dessous, hors de la bannière, pour
                qu'une longue présentation n'étire pas l'image sous le texte.

                Le dégradé (fondu d'opacité, voir WorldHeroCard.tsx) démarre à
                --hero-fade-start et devient transparent à 100% de ce
                conteneur, c'est-à-dire au pied du titre. `min-h` garantit
                une présence minimale de la bannière. Hauteur réservée (pt-40) et début du fondu sont
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
            <WorldHomeHeader
              world={world}
              condensed={headerCondensed}
              isFavorite={isFavorite}
              onToggleFavorite={handleToggleFavorite}
              onOpenSearch={() => setSearchOpen(true)}
            />
            <SearchCenter worldId={worldId} open={searchOpen} onOpenChange={setSearchOpen} />

            <div className="relative min-h-60 shrink-0 [--hero-fade-start:6rem]">
              <WorldHeroCard world={world} />

              {/* Icône + titre, désormais du contenu de page normal
                  (plus superposés sur la bannière). `pt-40` réserve la hauteur
                  visuelle de la bannière — à garder en phase avec
                  --hero-fade-* du conteneur parent. `relative` est nécessaire
                  ici : sans position, ce bloc statique se peindrait sous le
                  fond absolu de WorldHeroCard malgré son ordre plus tardif
                  dans le DOM (règles d'empilement CSS), le rendant invisible. */}
              <div className="relative w-full space-y-2 px-3 pt-40 sm:px-6 md:px-8 lg:px-12">
                <WorldHomeIcon world={world} size={44} />
                <h1 ref={setTitleEl} className="text-2xl font-semibold text-foreground md:text-3xl">
                  {world.name}
                </h1>
              </div>
            </div>

            {/* Description et statistiques, sous la bannière mais collées au
                titre. Les statistiques ont une position fixe ici (pas un bloc
                de la grille) — seul leur affichage se règle, depuis Réglages
                > Page d'accueil (voir WorldHomeGridSettings.tsx). */}
            {(world.description || world.home_show_stats) && (
              <div
                className="w-full shrink-0 space-y-2 px-3 pt-1 sm:px-6 md:px-8 lg:px-12"
                data-testid="world-home-intro"
              >
                {world.description && (
                  <p className="text-sm text-muted-foreground">{world.description}</p>
                )}
                {world.home_show_stats && <WorldStatsWidget worldId={worldId} />}
              </div>
            )}

            {/* Panel de contenu : accueille la grille de blocs configurée par
                l'admin (voir WorldHomeGridView / WorldHomeGridEditor).
                `shrink-0` pour la même raison que le bloc bannière ci-dessus —
                sans lui, la grille se ferait comprimer et son contenu
                déborderait de la boîte au lieu de faire défiler la page. */}
            <div className="shrink-0 px-3 pt-4 pb-12 sm:px-6 md:px-8 lg:px-12">
              <div data-home-panel className="w-full rounded-2xl">
                <WorldHomeGridView
                  items={gridItems}
                  worldId={worldId}
                  canPost={canPost}
                  canCreateChatroom={create_chatroom}
                  timelineConfig={hasTimeline ? (world.timeline_config as WorldTimelineConfig) : undefined}
                  initialRooms={initialRooms}
                  categories={initialCategories}
                  widgetData={initialWidgetData}
                  initialComposerPinId={initialPlayPinId}
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
