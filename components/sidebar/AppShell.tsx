"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import DmsProvider, { useDms } from "@/components/providers/DmsProvider";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { MobileSidebarProvider, useMobileSidebar } from "@/components/providers/MobileSidebarProvider";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { WorldsRail } from "./WorldsRail";
import type { Quota } from "@/lib/userQuota";

type WorldRailItem = { id: string; name: string; icon_url: string | null; owner_id: string };

const DEFAULT_WORLDS_QUOTA: Quota = { plan: "free", owned: 0, quotaLimit: 1, quotaReached: false };

const NotificationInlinePanelContent = dynamic(
  () => import("@/components/notifications").then((m) => m.NotificationInlinePanelContent),
  { ssr: false },
);
const DmsPanelContent = dynamic(
  () => import("@/components/dms").then((m) => m.DmsPanelContent),
  { ssr: false },
);

// Onglets secondaires d'un monde ayant leur propre header (avec bouton menu intégré).
const WORLD_PANEL_VIEWS = new Set([
  "members", "personas", "wiki", "canvas", "catalogue", "map", "timeline", "settings",
]);

// ── Inner shell — consomme useDms() et useNotifications() ────────────────────

function AppShellInner({
  rail,
  worlds,
  worldsQuota,
  children,
}: {
  rail: React.ReactNode;
  worlds: WorldRailItem[];
  worldsQuota: Quota;
  children: React.ReactNode;
}) {
  const { notifications: notifEnabled, direct_messages: dmsEnabled, public_worlds: exploreEnabled } = useFeatureFlags();
  const { panelOpen: dmsOpen, closePanel: closeDms } = useDms();
  const { panelOpen: notifOpen, closePanel: closeNotif } = useNotifications();
  const { mobileSidebar, drawerOpen, setDrawerOpen, hideMobileHeader } = useMobileSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Ferme le drawer à chaque navigation. La nav des mondes change souvent
  // seulement la query (`/w/{id}?view=members`), d'où la dépendance aux
  // searchParams en plus du pathname — sinon le drawer reste ouvert par-dessus
  // la vue qu'on vient de sélectionner.
  useEffect(() => { setDrawerOpen(false); }, [pathname, searchParams, setDrawerOpen]);

  const isWorldOrChat = (pathname?.startsWith("/w/") || pathname?.startsWith("/c/")) ?? false;
  // Les pages de chatroom affichent leur propre header (visible sur mobile
  // désormais) avec le bouton menu intégré en tête — la barre générique
  // ci-dessous serait redondante (cf. ChatroomHeader dans app/(protected)/c/[id]/view.tsx).
  const isChatRoute = pathname?.startsWith("/c/") ?? false;
  // Idem pour les onglets secondaires d'un monde (membres, personas, wiki, …) :
  // chacun a son propre header avec le bouton menu intégré (cf. WorldHome.tsx).
  // Seule la vue par défaut (?view absent) n'en a pas et garde la barre générique.
  const worldView = searchParams.get("view");
  const hasWorldPanelHeader = (pathname?.startsWith("/w/") ?? false) && !!worldView && WORLD_PANEL_VIEWS.has(worldView);
  const anyPanelOpen = notifOpen || dmsOpen;

  // Exclusivité mutuelle
  useEffect(() => { if (notifOpen) closeDms(); }, [notifOpen, closeDms]);
  useEffect(() => { if (dmsOpen) closeNotif(); }, [dmsOpen, closeNotif]);

  function handleDrawerChange(open: boolean) {
    setDrawerOpen(open);
    if (!open) { closeDms(); closeNotif(); }
  }

  return (
    <div className="relative flex h-full w-full flex-row lg:p-2">

      {/* Rail permanent (desktop) */}
      <aside className="relative z-20 hidden w-14 shrink-0 rounded-lg lg:flex">
        {rail}
      </aside>

      {/* Rail des mondes rejoints (desktop) — même composant que dans le
          drawer mobile ci-dessous, affiché en permanence à côté du rail
          d'icônes. */}
      {(worlds.length > 0 || exploreEnabled) && (
        <div className="relative z-20 hidden shrink-0 lg:flex pr-2">
          <WorldsRail worlds={worlds} quota={worldsQuota} />
        </div>
      )}

      {/* Panneau global — notifs ou DMs */}
      <div
        className="hidden lg:block shrink-0 overflow-hidden rounded-lg transition-[width] duration-300 ease-in-out"
        style={{ width: anyPanelOpen ? "360px" : "0px" }}
      >
        <div className="h-full w-[360px] overflow-hidden border-l">
          {notifOpen && notifEnabled && <NotificationInlinePanelContent />}
          {dmsOpen && dmsEnabled && <DmsPanelContent />}
        </div>
      </div>

      {/* Drawer mobile */}
      <Drawer open={drawerOpen} onOpenChange={handleDrawerChange} swipeDirection="left">
        <DrawerContent
          className={cn(
            "inset-y-0 left-0 border rounded-md bg-background text-foreground shadow-lg",
            anyPanelOpen || mobileSidebar ? "w-[min(calc(100%_-_var(--drawer-inset)*2),_360px)] touch:w-[min(calc(100%_-_var(--drawer-inset)*2),_460px)]" : "w-auto max-w-none",
          )}
        >
          <VisuallyHidden><DrawerTitle>Navigation</DrawerTitle></VisuallyHidden>
          <div className="flex h-full overflow-hidden">
            {/* Rail d'icônes */}
            <div className={cn(
              "w-14 shrink-0 flex flex-col overflow-y-auto py-2",
              (anyPanelOpen || mobileSidebar || worlds.length > 0 || exploreEnabled) && "border-r",
            )}>
              {rail}
            </div>
            {/* Rail des mondes rejoints (+ lien Explorer en tête) — seul lien
                mobile vers un monde depuis les pages hors-monde (explore,
                personas, …), donc affiché dès qu'il y en a au moins un, pas
                seulement > 1 ; affiché aussi à 0 monde si Explorer est actif,
                pour ne pas priver les comptes sans monde de ce lien.
                Masqué quand un panneau (DMs/notifs) occupe l'espace restant,
                pour lui laisser toute la largeur. */}
            {(worlds.length > 0 || exploreEnabled) && !anyPanelOpen && <WorldsRail worlds={worlds} quota={worldsQuota} />}
            {/* Panneau DMs / Notifications, ou sidebar monde */}
            {(anyPanelOpen || mobileSidebar) && (
              <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
                {dmsOpen && dmsEnabled ? (
                  <DmsPanelContent />
                ) : notifOpen && notifEnabled ? (
                  <NotificationInlinePanelContent />
                ) : (
                  mobileSidebar
                )}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Contenu principal */}
      <section id="app-shell" className="relative flex min-h-0 max-w-full flex-1 flex-col">
        <header className={cn("lg:hidden flex h-12 shrink-0 items-center p-2", (isChatRoute || hasWorldPanelHeader || hideMobileHeader) && "hidden")}>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hoverCard"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <main className="relative flex h-full w-full flex-1 overflow-hidden lg:border lg:bg-background lg:rounded-lg">
          <div
            id="thread"
            className={cn(
              "group/thread @container/thread h-full",
              isWorldOrChat ? "w-full overflow-hidden" : "flex-1 min-w-0 overflow-auto",
            )}
          >
            {children}
          </div>
        </main>
      </section>

    </div>
  );
}

// ── Shell public — fournit DmsProvider ───────────────────────────────────────

export default function AppShell({
  rail,
  worlds = [],
  worldsQuota = DEFAULT_WORLDS_QUOTA,
  children,
}: {
  rail: React.ReactNode;
  worlds?: WorldRailItem[];
  worldsQuota?: Quota;
  children: React.ReactNode;
}) {
  return (
    <MobileSidebarProvider>
      <DmsProvider>
        <AppShellInner rail={rail} worlds={worlds} worldsQuota={worldsQuota}>{children}</AppShellInner>
      </DmsProvider>
    </MobileSidebarProvider>
  );
}
