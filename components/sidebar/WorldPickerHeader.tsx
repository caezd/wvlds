"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut, Plus, Star } from "lucide-react";
import { WorldAvatar } from "@/components/avatars/WorldAvatar";
import { CreateWorldDialog } from "./CreateWorldDialog";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { leaveWorld } from "@/app/actions/worlds";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  is_favorite?: boolean;
};

export function WorldPickerHeader({
  worlds,
  currentWorldId,
  currentUserId,
  plan,
  ownedCount,
  quotaLimit,
}: {
  worlds: WorldItem[];
  currentWorldId: string;
  currentUserId: string | null;
  plan: "free" | "subscribed" | "lifetime";
  ownedCount: number;
  quotaLimit: number;
}) {
  const router = useRouter();
  const t = useTranslations("worlds");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingLeave, setPendingLeave] = useState<WorldItem | null>(null);
  const [leaving, startLeaving] = useTransition();

  function confirmLeave() {
    if (!pendingLeave) return;
    const world = pendingLeave;
    const wasCurrent = world.id === currentWorldId;
    startLeaving(async () => {
      const res = await leaveWorld(world.id);
      setPendingLeave(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("leftWorld", { name: world.name }));
      if (wasCurrent) {
        // Quitter le monde affiché démonte toute la sidebar (dont ce
        // dialog) au milieu de sa navigation. Radix retire le lock
        // `pointer-events: none` posé sur <body> pendant l'animation de
        // fermeture, mais celle-ci n'a pas le temps de se terminer avant
        // que la navigation ne détruise l'arbre — le DOM reste alors figé.
        // On force donc le nettoyage nous-mêmes avant de naviguer.
        document.body.style.pointerEvents = "";
        router.push("/explore");
      } else {
        router.refresh();
      }
    });
  }

  const currentWorld = worlds.find((w) => w.id === currentWorldId) ?? null;
  const disabled = quotaLimit !== Infinity && ownedCount >= quotaLimit;

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

  // Favoris en tête de liste — tri stable, l'ordre alphabétique (déjà
  // appliqué côté serveur) est conservé au sein de chaque groupe.
  const otherWorlds = worlds
    .filter((w) => w.id !== currentWorldId)
    .sort((a, b) => Number(!!b.is_favorite) - Number(!!a.is_favorite));

  return (
    <div className="shrink-0 border-b px-2 py-1 h-header-height flex flex-col justify-center min-w-0">
      <div ref={containerRef} className="relative">
        {/* Dropdown flottant */}
        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 overflow-hidden rounded-lg border border-border bg-background shadow-lg z-50">
            <div className="px-1 py-1">
              {otherWorlds.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Aucun autre monde</p>
              ) : (
                otherWorlds.map((w) => {
                  const unread = worldUnread[w.id] ?? 0;
                  const canLeave = currentUserId !== null && w.owner_id !== currentUserId;
                  const row = (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => { router.push(`/w/${w.id}`); setOpen(false); }}
                      data-testid="world-picker-item"
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
                      {w.is_favorite && (
                        <Star className="h-3.5 w-3.5 shrink-0 fill-yellow-500 text-yellow-500" />
                      )}
                    </button>
                  );

                  if (!canLeave) return row;

                  return (
                    <ContextMenu key={w.id}>
                      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          variant="destructive"
                          onSelect={() => { setPendingLeave(w); setOpen(false); }}
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          {t("leave")}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
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
        {(() => {
          const trigger = (
            <div className={cn(
              "flex items-center gap-1 rounded-lg transition-colors"
            )}>
              <button
                type="button"
                onClick={() => setOpen(v => !v)}
                // Repère stable pour les tests de bout en bout : les
                // libellés dépendent de la langue du navigateur.
                data-testid="world-picker-trigger"
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
          );

          const canLeaveCurrent =
            !!currentWorld && currentUserId !== null && currentWorld.owner_id !== currentUserId;
          if (!canLeaveCurrent) return trigger;

          return (
            <ContextMenu>
              <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  variant="destructive"
                  onSelect={() => { setPendingLeave(currentWorld); setOpen(false); }}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t("leave")}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })()}
      </div>

      <AlertDialog open={!!pendingLeave} onOpenChange={(v) => { if (!v) setPendingLeave(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("leaveConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("leaveConfirmDescription", { name: pendingLeave?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>{t("leaveConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmLeave()}
              disabled={leaving}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t("leaveConfirmContinue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
