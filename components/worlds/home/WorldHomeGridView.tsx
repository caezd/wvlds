"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { WorldChatComposer } from "../chatrooms/WorldChatComposer";
import { WorldChatroomsGrid } from "../chatrooms/WorldChatroomsGrid";
import { WorldCategoryFolders } from "../chatrooms/WorldCategoryFolders";
import { WorldTimelineShortcutsWidget } from "./widgets/WorldTimelineShortcutsWidget";
import { WorldHomeBannerView } from "./blocks/WorldHomeBannerBlock";
import { cn } from "@/lib/utils";
import type { WorldTimelineConfig, WorldHomeRoom as Room } from "@/types/worlds";
import type { ChatroomCategory } from "@/lib/currentRequest";
import type { RecentPersona } from "./widgets/WorldRecentPersonasWidget";
import type { WikiPage } from "./widgets/WorldWikiShortcutsWidget";
import {
  DEFAULT_HOME_GRID_GAP,
  HOME_GRID_COLS,
  HOME_GRID_GAP_PRESETS,
  widgetOptionValue,
  type WorldHomeGridGap,
  type WorldHomeGridItem,
} from "./worldHomeGrid";

const WorldMembersOnlineWidget = dynamic(() => import("./widgets/WorldMembersOnlineWidget").then((m) => m.WorldMembersOnlineWidget));
const WorldWikiShortcutsWidget = dynamic(() => import("./widgets/WorldWikiShortcutsWidget").then((m) => m.WorldWikiShortcutsWidget));
const WorldRecentPersonasWidget = dynamic(() => import("./widgets/WorldRecentPersonasWidget").then((m) => m.WorldRecentPersonasWidget));


/**
 * Rendu lecture seule de la grille de blocs de la page d'accueil — pure
 * grille CSS (pas de react-grid-layout ici : aucun drag/resize/collision à
 * charger pour un simple visiteur, seul l'éditeur admin dans Réglages en a
 * besoin). Position/taille en unités de grille identiques à celles de
 * l'éditeur (mêmes constantes partagées, voir worldHomeGrid.ts). Sous le
 * breakpoint `sm`, la grille repasse en une colonne unique triée par `y`.
 *
 * Chaque cellule est un conteneur de container queries (`@container`) : les
 * blocs à l'intérieur (WorldCategoryFolders, WorldChatroomsGrid…) adaptent
 * leur mise en page à la largeur réelle de LEUR cellule (pas au viewport),
 * plutôt que de dépendre d'un `overflow` pour masquer une carte mal ajustée.
 *
 * Les lignes s'auto-dimensionnent (`grid-auto-rows: min-content`) : un bloc
 * occupe toujours exactement une ligne, dont la hauteur suit son contenu
 * réel. Aucun `overflow` de secours n'est donc nécessaire — un contenu long
 * (beaucoup de salons) agrandit sa ligne au lieu de déborder sur les blocs
 * suivants, et la hauteur n'a jamais à être devinée par l'admin.
 */
export function WorldHomeGridView({
  items,
  worldId,
  canPost,
  canCreateChatroom,
  timelineConfig,
  initialRooms,
  categories = [],
  widgetData = {},
  selectedCategoryId,
  onSelectCategory,
  onWikiLink,
  gap = DEFAULT_HOME_GRID_GAP,
}: {
  items: WorldHomeGridItem[];
  worldId: string;
  canPost: boolean;
  canCreateChatroom: boolean;
  timelineConfig?: WorldTimelineConfig;
  initialRooms: Room[];
  /** Catégories chargées côté serveur (getChatroomCategories) — évite au bloc
   *  « Catégories » de repartir d'un état vide puis de les refetcher. */
  categories?: ChatroomCategory[];
  /** Données des widgets résolues côté serveur. */
  widgetData?: { recentPersonas?: RecentPersona[]; wikiPages?: WikiPage[] };
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  onWikiLink?: (slug: string) => void;
  /** Gouttière — même préréglage que l'éditeur admin, voir worldHomeGrid.ts. */
  gap?: WorldHomeGridGap;
}) {
  const t = useTranslations("worlds");
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

  return (
    <div
      className="grid auto-rows-min grid-cols-1 sm:grid-cols-12"
      style={{ gap: HOME_GRID_GAP_PRESETS[gap] }}
    >
      {sorted.map((item) => (
        <div
          key={item.id}
          style={{
            "--gc": `${item.x + 1} / span ${item.w}`,
            "--gr": `${item.y + 1}`,
          } as React.CSSProperties}
          className="@container min-w-0 sm:[grid-column:var(--gc)] sm:[grid-row:var(--gr)]"
        >
          {renderBlock(item, {
            worldId,
            canPost,
            canCreateChatroom,
            timelineConfig,
            initialRooms,
            categories,
            widgetData,
            selectedCategoryId,
            onSelectCategory,
            onWikiLink,
            htmlBlockFallbackTitle: t("home.grid.htmlBlockTitle"),
          })}
        </div>
      ))}
    </div>
  );
}

function renderBlock(
  item: WorldHomeGridItem,
  ctx: {
    worldId: string;
    canPost: boolean;
    canCreateChatroom: boolean;
    timelineConfig?: WorldTimelineConfig;
    initialRooms: Room[];
    categories: ChatroomCategory[];
    widgetData: { recentPersonas?: RecentPersona[]; wikiPages?: WikiPage[] };
    selectedCategoryId: string | null;
    onSelectCategory: (categoryId: string | null) => void;
    onWikiLink?: (slug: string) => void;
    htmlBlockFallbackTitle: string;
  },
) {
  if (item.type === "banner") {
    return item.banner ? <WorldHomeBannerView banner={item.banner} /> : null;
  }

  if (item.type === "html") {
    return (
      <iframe
        sandbox=""
        srcDoc={item.html ?? ""}
        title={item.title || ctx.htmlBlockFallbackTitle}
        className={cn("h-full w-full", item.card !== false && "rounded-lg border bg-background")}
      />
    );
  }

  if (item.type === "markdown") {
    const content = <MarkdownRenderer content={item.content ?? ""} allowImages onWikiLink={ctx.onWikiLink} />;
    return item.card ? (
      <div className="rounded-lg border border-border-soft bg-card/40 p-4">{content}</div>
    ) : (
      content
    );
  }

  switch (item.widgetId) {
    case "categories":
      return (
        <WorldCategoryFolders
          worldId={ctx.worldId}
          selectedCategoryId={ctx.selectedCategoryId}
          onSelectCategory={ctx.onSelectCategory}
          fullWidth={item.w >= HOME_GRID_COLS}
          initialCategories={ctx.categories}
          initialRooms={ctx.initialRooms}
        />
      );
    case "composer":
      return (
        <WorldChatComposer worldId={ctx.worldId} timelineConfig={ctx.timelineConfig} />
      );
    case "chatrooms":
      return (
        <WorldChatroomsGrid
          worldId={ctx.worldId}
          initialRooms={ctx.initialRooms}
          categoryId={ctx.selectedCategoryId}
          visibleRows={widgetOptionValue("chatrooms", "visibleRows", item.options)}
        />
      );
    case "members_online":
      return (
        <WorldMembersOnlineWidget
          worldId={ctx.worldId}
          limit={widgetOptionValue("members_online", "limit", item.options)}
        />
      );
    case "wiki_shortcuts":
      return (
        <WorldWikiShortcutsWidget
          worldId={ctx.worldId}
          limit={widgetOptionValue("wiki_shortcuts", "limit", item.options)}
          initialPages={ctx.widgetData.wikiPages}
        />
      );
    case "personas_recent":
      return (
        <WorldRecentPersonasWidget
          worldId={ctx.worldId}
          limit={widgetOptionValue("personas_recent", "limit", item.options)}
          initialPersonas={ctx.widgetData.recentPersonas}
        />
      );
    case "timeline_shortcuts":
      return (
        <WorldTimelineShortcutsWidget
          worldId={ctx.worldId}
          rooms={ctx.initialRooms}
          config={ctx.timelineConfig}
          limit={widgetOptionValue("timeline_shortcuts", "limit", item.options)}
        />
      );
    default:
      return null;
  }
}
