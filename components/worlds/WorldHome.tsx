"use client";

import { useRef, useState } from "react";
import { BookOpenText, Network, Settings, Users as UsersIcon } from "lucide-react";
import { RelationsCanvas } from "./RelationsCanvas";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

import { WorldHeroCard } from "./WorldHeroCard";
import { WorldTabs } from "./WorldTabs";
import { WorldTabContent } from "./WorldTabContent";
import { WorldChatComposer } from "./WorldChatComposer";
import { WorldChatroomsGrid } from "./WorldChatroomsGrid";
import { WorldMembersSheet } from "./WorldMembersSheet";
import WorldEditDialog, { type World } from "./WorldEditDialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import {
  WorldPersonaAsideClient,
  type AsidePersona,
} from "@/components/personas/WorldPersonaAsideClient";
import { saveWorldPrefs, toggleWorldFavorite } from "@/app/(protected)/w/actions";

export const ASIDE_MIN = 150;
export const ASIDE_MAX = 380;
const ASIDE_DEFAULT = 192;

type WorldPrefs = { aside_width: number; main_expanded: boolean; is_favorite: boolean };

type HeroWorld = World & { owner_id: string };

type Room = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  last_message_excerpt?: string | null;
  unread_count: number;
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
}) {
  const { create_chatroom } = useFeatureFlags();
  const router = useRouter();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [personaSheetOpen, setPersonaSheetOpen] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [asideWidth, setAsideWidth] = useState(
    initialPrefs?.aside_width ?? ASIDE_DEFAULT,
  );
  const [mainExpanded, setMainExpanded] = useState(
    initialPrefs?.main_expanded ?? false,
  );
  const [isFavorite, setIsFavorite] = useState(
    initialPrefs?.is_favorite ?? false,
  );

  // ── Persistance via server action ─────────────────────────────
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave(patch: Partial<WorldPrefs>) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(
      () => void saveWorldPrefs(worldId, patch),
      600,
    );
  }

  // ── Resize de l'aside (pointer capture) ──────────────────────
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const asideWidthRef = useRef(asideWidth);
  asideWidthRef.current = asideWidth;

  function onResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = asideWidthRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    const delta = dragStartX.current - e.clientX;
    const w = Math.min(ASIDE_MAX, Math.max(ASIDE_MIN, dragStartWidth.current + delta));
    setAsideWidth(w);
  }

  function onResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    isDragging.current = false;
    const delta = dragStartX.current - e.clientX;
    const w = Math.min(ASIDE_MAX, Math.max(ASIDE_MIN, dragStartWidth.current + delta));
    setAsideWidth(w);
    scheduleSave({ aside_width: w });
  }

  // ── Toggle favori ─────────────────────────────────────────────
  function handleToggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    void toggleWorldFavorite(worldId, next);
  }

  // ── Toggle plein écran ────────────────────────────────────────
  function handleToggleExpand() {
    const next = !mainExpanded;
    setMainExpanded(next);
    void saveWorldPrefs(worldId, { main_expanded: next });
  }

  const tabsPanel = (
    <WorldTabs
      worldId={worldId}
      canEdit={canEditTabs}
      renderTab={(tab) => (
        <WorldTabContent
          key={tab.id}
          tabId={tab.id}
          initialContent={tab.content ?? null}
          canEdit={canEditTabs}
        />
      )}
    />
  );

  const personaAside = (
    <WorldPersonaAsideClient
      worldId={worldId}
      personas={initialPersonas}
      asideWidth={asideWidth}
    />
  );

  return (
    <>
      {/* Carte centrale */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-border-soft bg-background">

        {showCanvas ? (
          <RelationsCanvas
            worldId={worldId}
            userId={userId ?? ""}
            canAdmin={canAdmin}
            onClose={() => setShowCanvas(false)}
          />
        ) : (
          <>
            {/* Contenu principal scrollable */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="flex w-full flex-col gap-6">
                {/* Hero — plein écran ou contraint selon mainExpanded */}
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
                {/* Contenu — toujours contraint */}
                <div className="mx-auto flex w-full flex-col gap-6 px-4 pb-4 [--world-content-max-width:36rem] lg:[--world-content-max-width:44rem] max-w-(--world-content-max-width)">
                  {canPost && create_chatroom && <WorldChatComposer worldId={worldId} />}
                  <WorldChatroomsGrid worldId={worldId} initialRooms={initialRooms} />
                </div>
              </div>
            </div>

            {/* Handle de redimensionnement — desktop uniquement */}
            <div
              className="group relative hidden w-2 shrink-0 cursor-col-resize select-none md:block"
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-soft transition-colors group-hover:bg-border" />
            </div>

            {/* Sidebar personas — visible à partir de md */}
            <aside
              className="hidden md:flex md:flex-col shrink-0 border-l border-border-soft"
              style={{ width: asideWidth }}
            >
              {personaAside}
            </aside>
          </>
        )}
      </div>

      {/* Rail d'icônes droit — hors de la carte */}
      <div className="flex shrink-0 flex-col items-center gap-2 pt-3">
        {canAdmin && (
          <>
            <WorldEditDialog
              world={world}
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              onUpdated={(updated) => {
                Object.assign(world, updated);
                router.refresh();
              }}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Paramètres du monde"
                  onClick={() => setSettingsOpen(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8}>Paramètres</TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Personas — mobile uniquement */}
        <Sheet open={personaSheetOpen} onOpenChange={setPersonaSheetOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Personas"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
                >
                  <UsersIcon className="h-4 w-4" />
                </button>
              </SheetTrigger>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>Personas</TooltipContent>
          </Tooltip>
          <SheetContent side="right" className="w-64 gap-0 p-0">
            <SheetTitle className="sr-only">Personas du monde</SheetTitle>
            <div className="flex h-full min-h-0 flex-col pt-10">
              {personaAside}
            </div>
          </SheetContent>
        </Sheet>

        <Sheet>
          <Tooltip>
            <TooltipTrigger asChild>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Onglets du monde"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <BookOpenText className="h-4 w-4" />
                </button>
              </SheetTrigger>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>Onglets</TooltipContent>
          </Tooltip>
          <SheetContent side="right" className="w-[88%] gap-0 p-0 sm:max-w-3xl">
            <SheetTitle className="sr-only">Onglets du monde</SheetTitle>
            <div className="flex h-full min-h-0 flex-col pt-10">
              {tabsPanel}
            </div>
          </SheetContent>
        </Sheet>

        {isShared && (
          <WorldMembersSheet
            worldId={worldId}
            ownerId={world.owner_id}
            canManage={canAdmin}
          />
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Toile des relations"
              onClick={() => setShowCanvas((v) => !v)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                showCanvas && "bg-secondary text-foreground border-border",
              )}
            >
              <Network className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>Relations</TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}
