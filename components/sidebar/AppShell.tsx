"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotifPanelCtx } from "@/components/notifications/notif-panel-context";
import { NotificationInlinePanelContent } from "@/components/notifications/NotificationPanel";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CollapsedRail } from "./CollapsedRail";

export default function AppShell({
  rail,
  children,
  headerUserMenu = null,
  userId,
  username,
  email,
  avatarUrl,
  plan,
  isAdmin,
}: {
  rail: React.ReactNode;
  children: React.ReactNode;
  headerUserMenu?: React.ReactNode;
  userId?: string;
  username?: string | null;
  email?: string;
  avatarUrl?: string | null;
  plan?: string | null;
  isAdmin?: boolean;
}) {
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { notifications: notificationsEnabled } = useFeatureFlags();
  const pathname = usePathname();

  // Le panel contextuel est affiché sur les pages monde et salon
  const showContextPanel =
    (pathname?.startsWith("/w/") || pathname?.startsWith("/c/")) ?? false;

  const userProps = { userId, username, email, avatarUrl, plan, isAdmin };

  return (
    <NotifPanelCtx.Provider value={{
      open: notifPanelOpen,
      toggle: () => setNotifPanelOpen(v => !v),
      close: () => setNotifPanelOpen(false),
    }}>
      <div className="relative flex h-full w-full flex-row gap-2 p-1">

        {/* ── Rail étroit sombre (permanent, desktop) ── */}
        <aside className="relative z-20 hidden w-14 shrink-0 overflow-hidden rounded-lg lg:flex"
        >
          {/* Fond sombre */}
          <div className="absolute inset-0 rounded-lg bg-background border" />
          <div className="relative z-10 w-full">
            <CollapsedRail {...userProps} />
          </div>
        </aside>

        {/* ── Panel contextuel (desktop, transparent sur fond) ── */}
        {showContextPanel && (
          <aside className="relative z-10 hidden w-[300px] shrink-0 lg:block">
            {rail}
            {notificationsEnabled && (
              <div
                className={cn(
                  "absolute right-0 top-0 h-full shrink-0 overflow-hidden rounded-lg transition-[width] duration-300 ease-in-out",
                  notifPanelOpen && "border border-border-soft bg-background",
                )}
                style={{ width: notifPanelOpen ? "300px" : "0px" }}
              >
                <div className="h-full w-[300px] overflow-hidden">
                  <NotificationInlinePanelContent onClose={() => setNotifPanelOpen(false)} />
                </div>
              </div>
            )}
          </aside>
        )}

        {/* ── Sidebar mobile — Sheet ── */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[260px] p-0 pt-10 border-r border-border-soft">
            {rail}
          </SheetContent>
        </Sheet>

        {/* ── Contenu principal (carte) ── */}
        <section id="app-shell" className="relative flex min-h-0 max-w-full flex-1 flex-col">
          {/* Header mobile */}
          <header className="lg:hidden flex h-12 shrink-0 items-center justify-between">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            {headerUserMenu}
          </header>
          <main
            className={cn(
              "relative h-full w-full flex-1 border bg-background rounded-lg",
              showContextPanel ? "overflow-hidden" : "overflow-auto",
            )}
          >
            <div id="thread" className="group/thread @container/thread h-full w-full">
              {children}
            </div>
          </main>
        </section>

      </div>
    </NotifPanelCtx.Provider>
  );
}
