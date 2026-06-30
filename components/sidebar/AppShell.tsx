"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
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
  worldsSidebar,
  children,
}: {
  rail: React.ReactNode;
  worldsSidebar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { notifications: notifEnabled, direct_messages: dmsEnabled } = useFeatureFlags();
  const { panelOpen: dmsOpen, closePanel: closeDms } = useDms();
  const { panelOpen: notifOpen, closePanel: closeNotif } = useNotifications();
  const { mobileSidebar, drawerOpen, setDrawerOpen } = useMobileSidebar();
  const pathname = usePathname();

  // Ferme le drawer sur navigation
  useEffect(() => { setDrawerOpen(false); }, [pathname, setDrawerOpen]);

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
          className="p-0 border-r border-border-soft w-full max-w-[360px]"
        >
          <VisuallyHidden><SheetTitle>Navigation</SheetTitle></VisuallyHidden>
          <div className="flex h-full overflow-hidden">
            {/* Rail d'icônes */}
            <div className={cn(
              "shrink-0 flex flex-col overflow-y-auto py-3",
              anyPanelOpen || mobileSidebar ? "w-14 border-r border-border-soft" : "w-full",
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
          {!isWorldOrChat && worldsSidebar}
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
  worldsSidebar,
  children,
}: {
  rail: React.ReactNode;
  worldsSidebar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <MobileSidebarProvider>
      <DmsProvider>
        <AppShellInner rail={rail} worldsSidebar={worldsSidebar}>{children}</AppShellInner>
      </DmsProvider>
    </MobileSidebarProvider>
  );
}
