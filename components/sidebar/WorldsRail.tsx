"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Compass, LogOut, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { WorldAvatar } from "@/components/avatars/WorldAvatar";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { useMobileSidebar } from "@/components/providers/MobileSidebarProvider";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useLongPress } from "@/hooks/useLongPress";
import { CreateWorldDialog } from "./CreateWorldDialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { leaveWorld } from "@/app/actions/worlds";
import { cn } from "@/lib/utils";
import type { Quota } from "@/lib/userQuota";

type WorldRailItem = { id: string; name: string; icon_url: string | null; owner_id: string };

export function WorldsRail({
  worlds,
  quota,
}: {
  worlds: WorldRailItem[];
  quota: Quota;
}) {
  const { worldUnread } = useNotifications();
  const { activeWorldId } = useMobileSidebar();
  const { public_worlds } = useFeatureFlags();
  const { userId: currentUserId } = useCurrentUser();
  const t = useTranslations("nav");
  const tWorlds = useTranslations("worlds");
  const pathname = usePathname();
  const router = useRouter();
  // `/w/[id]` révèle le monde directement dans le pathname ; sur `/c/[id]`
  // (chatroom), on retombe sur `activeWorldId` poussé par ChatRoomView.
  const pathWorldId = pathname?.match(/^\/w\/([^/?]+)/)?.[1] ?? null;
  const currentWorldId = pathWorldId ?? activeWorldId;

  // Détecté après montage (SSR = desktop par défaut) — pilote le choix entre
  // menu contextuel (clic droit) et drawer (long-press) pour "Quitter le monde".
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const [optionsTarget, setOptionsTarget] = useState<WorldRailItem | null>(null);
  const [pendingLeave, setPendingLeave] = useState<WorldRailItem | null>(null);
  const [leaving, startLeaving] = useTransition();

  // Un seul useLongPress partagé par toutes les icônes — le monde visé est
  // capturé dans une ref juste avant de déclencher le timer (cf. bindLongPress).
  const pressedWorldRef = useRef<WorldRailItem | null>(null);
  const longPress = useLongPress(useCallback(() => {
    if (!pressedWorldRef.current) return;
    try { navigator.vibrate?.(50); } catch { /* noop */ }
    setOptionsTarget(pressedWorldRef.current);
  }, []));

  function canLeave(world: WorldRailItem) {
    return currentUserId !== null && world.owner_id !== currentUserId;
  }

  function bindLongPress(world: WorldRailItem) {
    return {
      ...longPress,
      onTouchStart: (event: React.TouchEvent) => {
        pressedWorldRef.current = world;
        longPress.onTouchStart(event);
      },
    };
  }

  function confirmLeave() {
    if (!pendingLeave) return;
    const world = pendingLeave;
    startLeaving(async () => {
      const res = await leaveWorld(world.id);
      setPendingLeave(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(tWorlds("leftWorld", { name: world.name }));
      if (world.id === currentWorldId) {
        // cf. WorldPickerHeader — Radix laisse `pointer-events: none` sur
        // <body> pendant l'animation de fermeture, jamais nettoyé si la
        // navigation démonte l'arbre avant la fin.
        document.body.style.pointerEvents = "";
        router.push("/explore");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <aside className="flex w-16 shrink-0 flex-col items-center gap-1.5 overflow-y-auto border-r border-border-soft py-2 lg:border-r-0 lg:border-l">
        {public_worlds && (
          <Link
            href="/explore"
            aria-label={t("explore")}
            aria-current={pathname?.startsWith("/explore") ? "page" : undefined}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hoverCard hover:text-foreground",
              pathname?.startsWith("/explore") && "bg-hoverCard text-foreground",
            )}
          >
            <Compass className="h-[18px] w-[18px]" />
          </Link>
        )}
        {!quota.quotaReached && (
          <CreateWorldDialog
            plan={quota.plan}
            ownedCount={quota.owned}
            quotaLimit={quota.quotaLimit === Infinity ? 999 : quota.quotaLimit}
            trigger={
              <button
                type="button"
                aria-label={tWorlds("create")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent/90"
              >
                <Plus className="h-[18px] w-[18px]" />
              </button>
            }
          />
        )}
        {worlds.length > 0 && (
          <div className="my-0.5 h-px w-8 shrink-0 bg-border-soft" />
        )}
        {worlds.map((world) => {
          const isActive = world.id === currentWorldId;
          const unread = worldUnread[world.id] ?? 0;

          const link = (
            <Link
              href={`/w/${world.id}`}
              aria-label={world.name}
              aria-current={isActive ? "page" : undefined}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
              {...(isTouch ? bindLongPress(world) : {})}
            >
              {isActive && <span className="absolute w-[8px] h-[20px] bg-mist-50 -left-2 -translate-x-[8px] rounded-full" />}
              <WorldAvatar world={world} size="lg" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-bold leading-none text-accent-foreground ring-2 ring-background">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );

          if (isTouch) {
            return <Fragment key={world.id}>{link}</Fragment>;
          }

          return (
            <ContextMenu key={world.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ContextMenuTrigger asChild>{link}</ContextMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>{world.name}</TooltipContent>
              </Tooltip>
              <ContextMenuContent>
                <ContextMenuItem
                  variant="destructive"
                  disabled={!canLeave(world)}
                  onSelect={() => setPendingLeave(world)}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {tWorlds("leave")}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </aside>

      {/* Drawer mobile — options du monde (long-press) */}
      <Drawer open={!!optionsTarget} onOpenChange={(open) => { if (!open) setOptionsTarget(null); }} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="text-center text-sm font-medium text-muted-foreground">
              {optionsTarget?.name}
            </DrawerTitle>
            <DrawerDescription className="sr-only">{tWorlds("title")}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col pb-6">
            <button
              type="button"
              disabled={!optionsTarget || !canLeave(optionsTarget)}
              className="flex items-center gap-4 px-6 py-4 text-left text-base text-destructive transition-colors hover:bg-muted/50 disabled:opacity-40 disabled:pointer-events-none"
              onClick={() => {
                const world = optionsTarget;
                setOptionsTarget(null);
                if (world) setTimeout(() => setPendingLeave(world), 200);
              }}
            >
              <LogOut className="h-5 w-5 shrink-0" />
              {tWorlds("leave")}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Confirmation — commune desktop/mobile */}
      <AlertDialog open={!!pendingLeave} onOpenChange={(v) => { if (!v) setPendingLeave(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tWorlds("leaveConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tWorlds("leaveConfirmDescription", { name: pendingLeave?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>{tWorlds("leaveConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLeave}
              disabled={leaving}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {tWorlds("leaveConfirmContinue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
