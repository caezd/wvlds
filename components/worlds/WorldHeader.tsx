"use client";

import { useState, useEffect } from "react";

import { Globe, ChevronRight } from "lucide-react";
import WorldEditDialog from "@/components/worlds/WorldEditDialog";
import { Button } from "@/components/ui/button";
import { WorldInviteDialog } from "./WorldInviteDialog";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/components/providers/NotificationsProvider";

export function WorldHeader({
  world,
  canAdmin,
}: {
  world: {
    id: string;
    owner_id: string;
    name: string;
  };
  canAdmin: boolean;
}) {
  const router = useRouter();
  const [worldState, setWorld] = useState(world);

  const { setActiveWorld, markWorldSeen, refreshWorld } = useNotifications();

  useEffect(() => {
    setActiveWorld(worldState.id);
    void markWorldSeen(worldState.id);
    void refreshWorld(worldState.id);
  }, [worldState, setActiveWorld, markWorldSeen, refreshWorld]);

  return (
    <header className="draggable no-draggable-children sticky top-0 p-2 touch:p-2.5 flex items-center justify-between z-20 h-header-height bg-token-main-surface-primary pointer-events-none select-none [view-transition-name:var(--vt-page-header)] *:pointer-events-auto motion-safe:transition max-md:hidden [box-shadow:var(--sharp-edge-top-shadow-placeholder)] bg-background border-b border-border-soft">
      <div className="pointer-events-none absolute start-0 flex flex-col items-center gap-2 lg:start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2">
        {/* open button */}
      </div>
      <div className="flex flex-1 items-center justify-between">
        <div className="flex items-center">
          <a
            href=""
            className="hover:bg-hover-400 focus-visible:outline-token-outline-primary text-token-text-secondary ms-2 inline-flex h-9 w-9 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Globe size={20} className="icon" />
          </a>
          <ChevronRight size={16} className="icon-sm text-white/40" />
          {canAdmin ? (
            <WorldEditDialog
              world={world}
              trigger={<Button variant="ghost">{world.name}</Button>}
              onUpdated={(updated) => {
                // 1) mettre à jour l'état local pour refléter immédiatement le nouveau nom
                setWorld((prev) => ({ ...prev, ...updated }));
                // 2) (optionnel mais recommandé si d'autres blocs SSR lisent ce monde)
                router.refresh();
              }}
            />
          ) : (
            <Button variant="ghost">{worldState.name}</Button>
          )}
        </div>
        <WorldInviteDialog
          ownerId={world.owner_id}
          worldId={world.id}
          canManage={!!canAdmin}
        />
      </div>
    </header>
  );
}
