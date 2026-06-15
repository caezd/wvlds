"use client";

import { useState } from "react";
import { BookOpenText, Settings } from "lucide-react";
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
  canAdmin,
  isShared,
  canEditTabs,
  canPost,
  initialRooms,
}: {
  world: HeroWorld;
  worldId: string;
  canAdmin: boolean;
  isShared: boolean;
  canEditTabs: boolean;
  canPost: boolean;
  initialRooms: Room[];
}) {
  const { create_chatroom } = useFeatureFlags();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  return (
    <>
      {/* Carte centrale */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-2xl border border-border-soft bg-background">
        {/* Corps centré avec max-w */}
        <div className="mx-auto flex w-full flex-col gap-6 p-4 [--world-content-max-width:40rem] lg:[--world-content-max-width:48rem] max-w-(--world-content-max-width)">
          <WorldHeroCard world={world} canAdmin={canAdmin} />
          {canPost && create_chatroom && <WorldChatComposer worldId={worldId} />}
          <WorldChatroomsGrid worldId={worldId} initialRooms={initialRooms} />
        </div>
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
      </div>
    </>
  );
}
