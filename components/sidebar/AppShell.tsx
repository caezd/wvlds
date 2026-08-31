"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import DmsProvider, { useDms } from "@/components/providers/DmsProvider";
import { useNotificationsPanel } from "@/components/providers/NotificationsProvider";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { MobileSidebarProvider, useMobileSidebar } from "@/components/providers/MobileSidebarProvider";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { WorldsRail } from "./WorldsRail";
import type { Quota } from "@/lib/userQuota";

type WorldRailItem = { id: string; name: string; icon_url: string | null; owner_id: string };

const DEFAULT_WORLDS_QUOTA: Quota = { plan: "free", owned: 0, quotaLimit: 1, quotaReached: false };

// Rail des mondes masqué le temps de valider le nouveau panneau « favoris »
// intégré au rail d'icônes (cf. WorldsQuickAccess dans SidebarRail) — code
// conservé intact pour un retour en arrière facile.
const WORLDS_RAIL_ENABLED = false;

const NotificationInlinePanelContent = dynamic(
  () => import("@/components/notifications").then((m) => m.NotificationInlinePanelContent),
  { ssr: false },
);
const DmsPanelContent = dynamic(
  () => import("@/components/dms").then((m) => m.DmsPanelContent),
  { ssr: false },
);

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
  const tCommon = useTranslations("common");
  const { notifications: notifEnabled, direct_messages: dmsEnabled, public_worlds: exploreEnabled } = useFeatureFlags();
  const { panelOpen: dmsOpen, closePanel: closeDms } = useDms();
  // Contexte du panneau seul : AppShell enveloppe toute l'application et
  // n'utilise que ces deux valeurs. Via `useNotifications()`, il se re-rendait
  // à chaque message reçu dans n'importe lequel de vos mondes.
  const { panelOpen: notifOpen, closePanel: closeNotif } = useNotificationsPanel();
  const { mobileSidebar, drawerOpen, setDrawerOpen } = useMobileSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Ferme le drawer à chaque navigation. La nav des mondes change souvent
  // seulement la query (`/w/{id}?view=members`), d'où la dépendance aux
  // searchParams en plus du pathname — sinon le drawer reste ouvert par-dessus
  // la vue qu'on vient de sélectionner.
  useEffect(() => { setDrawerOpen(false); }, [pathname, searchParams, setDrawerOpen]);

  // Les pages de chatroom affichent leur propre header (visible sur mobile
  // désormais) avec le bouton menu intégré en tête — la barre générique
  // ci-dessous serait redondante (cf. ChatroomHeader dans app/(protected)/c/[id]/view.tsx).
  const isChatRoute = pathname?.startsWith("/c/") ?? false;
  // Idem pour *toutes* les vues d'un monde : les onglets secondaires (membres,
  // personas, wiki, …) ont leur WorldPanelHeader, et la vue par défaut a son
  // bouton menu incrusté sur la bannière (cf. WorldHome.tsx). Une valeur de
  // `view` inconnue — ou une vue désactivée pour ce monde — retombe justement
  // sur cette bannière : aucune URL sous /w/ ne se retrouve donc sans bouton.
  //
  // Cette condition se déduit de l'URL seule, volontairement. La vue par défaut
  // passait auparavant par un état client (`hideMobileHeader`, posé au montage
  // de WorldHome) : cet état arrivait trop tard — le rendu serveur, puis toute
  // la durée du `loading.tsx`, peignaient la barre h-12 avant qu'elle ne
  // disparaisse au montage, faisant remonter le contenu de 48 px d'un coup.
  const isWorldRoute = pathname?.startsWith("/w/") ?? false;
  // L'Explorateur a lui aussi son propre WorldPanelHeader (cf. explore/page.tsx).
  const isExploreRoute = pathname?.startsWith("/explore") ?? false;
  const isWorldOrChat = isWorldRoute || isChatRoute;
  const anyPanelOpen = notifOpen || dmsOpen;

  // Exclusivité mutuelle
  useEffect(() => { if (notifOpen) closeDms(); }, [notifOpen, closeDms]);
  useEffect(() => { if (dmsOpen) closeNotif(); }, [dmsOpen, closeNotif]);

  function handleDrawerChange(open: boolean) {
    setDrawerOpen(open);
    if (!open) { closeDms(); closeNotif(); }
  }

  // Gouttière sur trois côtés seulement : le panneau principal n'a plus de
  // bordure à gauche (voir le `<main>` plus bas), il vient donc s'appuyer
  // contre la navigation au lieu de flotter à un pixel d'elle.
  return (
    <div className="relative flex h-full w-full flex-row lg:py-2 lg:pr-2">

      {/* Rail permanent (desktop) */}
      <aside className="relative z-20 hidden w-14 shrink-0 rounded-lg lg:flex">
        {rail}
      </aside>

      {/* Rail des mondes rejoints (desktop) — même composant que dans le
          drawer mobile ci-dessous, affiché en permanence à côté du rail
          d'icônes. */}
      {WORLDS_RAIL_ENABLED && (worlds.length > 0 || exploreEnabled) && (
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
          <VisuallyHidden><DrawerTitle>{tCommon("navigation")}</DrawerTitle></VisuallyHidden>
          <div className="flex h-full overflow-hidden">
            {/* Rail d'icônes */}
            <div className={cn(
              "w-14 shrink-0 flex flex-col overflow-y-auto py-2",
              (anyPanelOpen || mobileSidebar || (WORLDS_RAIL_ENABLED && (worlds.length > 0 || exploreEnabled))) && "border-r",
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
            {WORLDS_RAIL_ENABLED && (worlds.length > 0 || exploreEnabled) && !anyPanelOpen && <WorldsRail worlds={worlds} quota={worldsQuota} />}
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
        <header className={cn("lg:hidden flex h-12 shrink-0 items-center p-2", (isChatRoute || isWorldRoute || isExploreRoute) && "hidden")}>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hoverCard"
            aria-label={tCommon("openMenu")}
            // Repère stable pour les tests de bout en bout : le libellé
            // dépend de la langue du navigateur.
            data-testid="open-mobile-menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        {/* `lg:border-l-0` : le bord gauche du panneau doublait la séparation déjà
            portée par la navigation qui le précède. Les trois autres côtés restent —
            ce sont eux qui détachent le panneau des bords de la fenêtre. */}
        <main className="relative flex h-full w-full flex-1 overflow-hidden lg:border lg:border-l-0 lg:bg-background lg:rounded-lg">
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
