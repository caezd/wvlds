"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WorldAvatar } from "@/components/avatars/WorldAvatar";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";
import { cn } from "@/lib/utils";

export function MobileWorldsRail({
  worlds,
}: {
  worlds: { id: string; name: string; icon_url: string | null }[];
}) {
  const { worldUnread } = useNotifications();
  const { activeWorldId } = useMobileSidebar();
  const pathname = usePathname();
  // `/w/[id]` révèle le monde directement dans le pathname ; sur `/c/[id]`
  // (chatroom), on retombe sur `activeWorldId` poussé par ChatRoomView.
  const pathWorldId = pathname?.match(/^\/w\/([^/?]+)/)?.[1] ?? null;
  const currentWorldId = pathWorldId ?? activeWorldId;

  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-1.5 overflow-y-auto border-r border-border-soft py-2">
      {worlds.map((world) => {
        const isActive = world.id === currentWorldId;
        const unread = worldUnread[world.id] ?? 0;
        return (
          <Link
            key={world.id}
            href={`/w/${world.id}`}
            aria-label={world.name}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
              isActive && "ring-2 ring-accent",
            )}
          >
            <WorldAvatar world={world} size="lg" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-bold leading-none text-accent-foreground ring-2 ring-background">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </aside>
  );
}
