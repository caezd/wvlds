"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Settings } from "lucide-react";
import { WorldAvatar } from "@/components/avatars/WorldAvatar";
import { cn } from "@/lib/utils";

export function WorldSidebarHeader({
  name,
  iconUrl,
  worldBase,
  canAdmin,
  settingsLabel,
}: {
  name: string;
  iconUrl: string | null;
  worldBase: string;
  canAdmin: boolean;
  settingsLabel: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isSettingsActive = pathname === worldBase && searchParams.get("view") === "settings";

  return (
    <div className="shrink-0 border-b px-2.5 h-header-height flex items-center justify-between gap-2 min-w-0">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <WorldAvatar world={{ name, icon_url: iconUrl }} size="sm" />
        <span className="flex-1 truncate text-sm font-medium text-mist-100">{name}</span>
      </div>
      {canAdmin && (
        <Link
          href={`${worldBase}?view=settings`}
          prefetch={false}
          aria-label={settingsLabel}
          aria-current={isSettingsActive ? "page" : undefined}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-mist-200 transition-colors hover:bg-hoverCard hover:text-foreground",
            isSettingsActive && "bg-hoverCard text-foreground",
          )}
        >
          <Settings className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
