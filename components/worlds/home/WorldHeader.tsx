"use client";

import { useEffect } from "react";

import { Globe, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorldInviteDialog } from "../members/WorldInviteDialog";
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
  const { markWorldSeen } = useNotifications();

  useEffect(() => {
    void markWorldSeen(world.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.id]);

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
          <Button variant="ghost">{world.name}</Button>
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
