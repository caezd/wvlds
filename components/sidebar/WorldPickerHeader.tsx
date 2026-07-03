"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Plus } from "lucide-react";
import { supabaseThumb } from "@/lib/storage";
import { CreateWorldDialog } from "./CreateWorldDialog";
import WorldEditDialog, { type World } from "@/components/worlds/WorldEditDialog";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type WorldItem = {
  id: string;
  name: string;
  icon_url: string | null;
  owner_id: string;
  description?: string | null;
  banner_url?: string | null;
  color?: string | null;
  visibility?: string | null;
  restrict_inventory?: boolean | null;
  restrict_skills?: boolean | null;
};

const COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-pink-500",
];

function worldColor(name: string) {
  return COLORS[name.charCodeAt(0) % COLORS.length];
}

function WorldAvatar({ world, size = "sm" }: { world: WorldItem; size?: "sm" | "md" }) {
  const initial = (world.name[0] ?? "W").toUpperCase();
  const color = worldColor(world.name);
  const dim = size === "md" ? "h-9 w-9" : "h-6 w-6";
  const text = size === "md" ? "text-xs" : "text-[10px]";
  return world.icon_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={supabaseThumb(world.icon_url, 48) ?? world.icon_url}
      alt=""
      className={cn(dim, "rounded-md object-cover shrink-0")}
    />
  ) : (
    <span className={cn("flex shrink-0 items-center justify-center rounded-md font-semibold text-white", dim, text, color)}>
      {initial}
    </span>
  );
}

export function WorldPickerHeader({
  worlds,
  currentWorldId,
  plan,
  ownedCount,
  quotaLimit,
  userId,
  isAdmin = false,
}: {
  worlds: WorldItem[];
  currentWorldId: string;
  plan: "free" | "subscribed" | "lifetime";
  ownedCount: number;
  quotaLimit: number;
  userId?: string;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("worlds");
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentWorld = worlds.find((w) => w.id === currentWorldId) ?? null;
  const disabled = quotaLimit !== Infinity && ownedCount >= quotaLimit;
  const canAdmin = !!currentWorld && (isAdmin || currentWorld.owner_id === userId);

  const { worldUnread } = useNotifications();
  const currentUnread = worldUnread[currentWorldId] ?? 0;
  const hasOtherUnread = worlds.some((w) => w.id !== currentWorldId && (worldUnread[w.id] ?? 0) > 0);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const currentWorldAsWorld: World | null = currentWorld
    ? {
      id: currentWorld.id,
      name: currentWorld.name,
      icon_url: currentWorld.icon_url,
      description: currentWorld.description,
      banner_url: currentWorld.banner_url,
      color: currentWorld.color,
      visibility: currentWorld.visibility,
      restrict_inventory: currentWorld.restrict_inventory,
      restrict_skills: currentWorld.restrict_skills,
    }
    : null;

  const otherWorlds = worlds.filter((w) => w.id !== currentWorldId);

  return (
    <div className="shrink-0 border-b border-border-soft pb-3">
      {canAdmin && currentWorldAsWorld && (
        <WorldEditDialog
          world={currentWorldAsWorld}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}

      <div ref={containerRef} className="relative">
        {/* Dropdown flottant */}
        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 overflow-hidden rounded-xl border border-border bg-background shadow-lg z-50">
            <div className="px-1 py-1">
              {otherWorlds.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Aucun autre monde</p>
              ) : (
                otherWorlds.map((w) => {
                  const unread = worldUnread[w.id] ?? 0;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => { router.push(`/w/${w.id}`); setOpen(false); }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-muted"
                    >
                      <div className="relative shrink-0">
                        <WorldAvatar world={w} size="md" />
                        {unread > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-accent px-0.5 text-[8px] font-bold leading-none text-accent-foreground shadow-[0_0_0_1.5px_hsl(var(--background))]">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>
                      <span className="flex-1 truncate text-left">{w.name}</span>
                    </button>
                  );
                })
              )}

              <div className="mx-1 my-1 border-t border-border-soft" />

              <CreateWorldDialog
                disabled={disabled}
                plan={plan}
                ownedCount={ownedCount}
                quotaLimit={quotaLimit === Infinity ? 999 : quotaLimit}
                trigger={
                  <button
                    type="button"
                    disabled={disabled}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    {t('create')}
                  </button>
                }
              />
            </div>
          </div>
        )}

        {/* Trigger — toujours visible */}
        <div className={cn(
          "flex items-center gap-1 rounded-xl p-1 transition-colors",
          open ? "bg-muted" : "hover:bg-muted/60",
        )}>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {currentWorld ? (
              <>
                <div className="relative shrink-0">
                  <WorldAvatar world={currentWorld} size="md" />
                  {currentUnread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-bold leading-none text-accent-foreground ring-2 ring-background">
                      {currentUnread > 99 ? "99+" : currentUnread}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium leading-tight text-mist-100">{currentWorld.name}</span>
                  <span className="truncate text-[11px] leading-tight text-mist-200">{t('switch')}</span>
                </div>

              </>
            ) : (
              <span className="flex-1 truncate text-sm text-muted-foreground">Mes mondes</span>
            )}
          </button>

          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center text-mist-200">
            <ChevronsUpDown className="h-4 w-4" />
            {hasOtherUnread && !open && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent absolute top-1/2 -translate-y-1/2 right-0" />
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
