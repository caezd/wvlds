"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationInlinePanelContent } from "@/components/notifications";
import { DmsPanelContent } from "@/components/dms";
import DmsProvider, { useDms } from "@/components/providers/DmsProvider";
import { useNotifications } from "@/components/providers/NotificationsProvider";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { MobileSidebarProvider, useMobileSidebar } from "@/components/providers/MobileSidebarProvider";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

// ── Inner shell — consomme useDms() et useNotifications() ────────────────────

function AppShellInner({
  rail,
  children,
}: {
  rail: React.ReactNode;
  children: React.ReactNode;
}) {
  const { notifications: notifEnabled, direct_messages: dmsEnabled } = useFeatureFlags();
  const { panelOpen: dmsOpen, closePanel: closeDms } = useDms();
  const { panelOpen: notifOpen, closePanel: closeNotif } = useNotifications();
  const { mobileSidebar, drawerOpen, setDrawerOpen } = useMobileSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Ferme le drawer à chaque navigation. La nav des mondes change souvent
  // seulement la query (`/w/{id}?view=members`), d'où la dépendance aux
  // searchParams en plus du pathname — sinon le drawer reste ouvert par-dessus
  // la vue qu'on vient de sélectionner.
  useEffect(() => { setDrawerOpen(false); }, [pathname, searchParams, setDrawerOpen]);

  const isWorldOrChat = (pathname?.startsWith("/w/") || pathname?.startsWith("/c/")) ?? false;
  const anyPanelOpen = notifOpen || dmsOpen;

  // Exclusivité mutuelle
  useEffect(() => { if (notifOpen) closeDms(); }, [notifOpen, closeDms]);
  useEffect(() => { if (dmsOpen) closeNotif(); }, [dmsOpen, closeNotif]);

  function handleDrawerChange(open: boolean) {
    setDrawerOpen(open);
    if (!open) { closeDms(); closeNotif(); }
  }

  return (
    <div className="relative flex h-full w-full flex-row p-2">

      {/* Rail permanent (desktop) */}
      <aside className="relative z-20 hidden w-14 shrink-0 rounded-lg lg:flex pr-2">
        {rail}
      </aside>

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
      <Sheet open={drawerOpen} onOpenChange={handleDrawerChange}>
        <SheetContent
          side="left"
          hideClose
          className={cn(
            "p-0 border-r border-border-soft",
            anyPanelOpen || mobileSidebar ? "w-full max-w-[360px]" : "w-auto max-w-none",
          )}
        >
          <VisuallyHidden><SheetTitle>Navigation</SheetTitle></VisuallyHidden>
          <div className="flex h-full overflow-hidden">
            {/* Rail d'icônes */}
            <div className={cn(
              "w-14 shrink-0 flex flex-col overflow-y-auto py-3",
              (anyPanelOpen || mobileSidebar) && "border-r border-border-soft",
            )}>
              {rail}
            </div>
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
        </SheetContent>
      </Sheet>

      {/* Contenu principal */}
      <section id="app-shell" className="relative flex min-h-0 max-w-full flex-1 flex-col">
        <header className="lg:hidden flex h-12 shrink-0 items-center">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <main className="relative flex h-full w-full flex-1 overflow-hidden border bg-background rounded-2xl">
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
  children,
}: {
  rail: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <MobileSidebarProvider>
      <DmsProvider>
        <AppShellInner rail={rail}>{children}</AppShellInner>
      </DmsProvider>
    </MobileSidebarProvider>
  );
}
