import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AppShell from "@/components/sidebar/AppShell";

// Évite les soucis de portail Radix/base-ui dans jsdom (même convention que
// ChatroomMessage.header.test.tsx pour Sheet/Popover/Drawer/...).
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const pathnameMock = vi.hoisted(() => ({ value: "/w/world-1" }));
const searchParamsMock = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock.value,
  useSearchParams: () => searchParamsMock.value,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (key === "explore" ? "Explorer" : key),
}));

const publicWorldsMock = vi.hoisted(() => ({ value: false }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ notifications: false, direct_messages: false, public_worlds: publicWorldsMock.value }),
}));

const notifPanelOpenMock = vi.hoisted(() => ({ value: false }));
vi.mock("@/components/providers/NotificationsProvider", () => ({
  // AppShell consomme le contexte du panneau seul ; les autres hooks restent
  // mockés pour les composants voisins rendus dans le même arbre.
  useNotificationsPanel: () => ({ panelOpen: notifPanelOpenMock.value, closePanel: vi.fn(), openPanel: vi.fn(), togglePanel: vi.fn() }),
  useNotifications: () => ({ panelOpen: notifPanelOpenMock.value, closePanel: vi.fn(), worldUnread: {} }),
}));

const dmsPanelOpenMock = vi.hoisted(() => ({ value: false }));
vi.mock("@/components/providers/DmsProvider", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDms: () => ({ panelOpen: dmsPanelOpenMock.value, closePanel: vi.fn() }),
}));

const WORLDS = [
  { id: "world-1", name: "Monde un", icon_url: null, owner_id: "owner-1" },
  { id: "world-2", name: "Monde deux", icon_url: null, owner_id: "owner-2" },
];

beforeEach(() => {
  pathnameMock.value = "/w/world-1";
  searchParamsMock.value = new URLSearchParams();
  notifPanelOpenMock.value = false;
  dmsPanelOpenMock.value = false;
  publicWorldsMock.value = false;
});

describe("AppShell — barre mobile générique vs pages à header propre", () => {
  function renderShell() {
    render(
      <AppShell rail={<div>rail</div>}>
        <div>contenu</div>
      </AppShell>,
    );
    return screen.getByLabelText("openMenu").closest("header");
  }

  it("affiche le bouton menu générique sur une page sans header propre (ex: mes personas)", () => {
    pathnameMock.value = "/p";
    expect(renderShell()).not.toHaveClass("hidden");
  });

  it("masque la barre générique sur une page de chatroom — ChatroomHeader prend le relais avec son propre bouton menu", () => {
    pathnameMock.value = "/c/chat-1";
    expect(renderShell()).toHaveClass("hidden");
  });

  // Régression : la vue par défaut d'un monde passait par un état client posé
  // au montage de WorldHome, donc absent du premier rendu — la barre h-12
  // était peinte puis retirée, faisant remonter le contenu de 48 px. La
  // décision doit se prendre dès le premier rendu, à partir de l'URL seule.
  it("masque la barre générique dès le premier rendu sur la page d'accueil d'un monde (?view absent), qui a son bouton incrusté sur la bannière", () => {
    pathnameMock.value = "/w/world-1";
    expect(renderShell()).toHaveClass("hidden");
  });

  it("masque la barre générique sur un onglet secondaire d'un monde (WorldPanelHeader)", () => {
    pathnameMock.value = "/w/world-1";
    searchParamsMock.value = new URLSearchParams("view=members");
    expect(renderShell()).toHaveClass("hidden");
  });

  // Une vue inconnue (ou désactivée pour ce monde) retombe sur la bannière
  // d'accueil, qui porte elle aussi un bouton menu.
  it("masque la barre générique même pour une valeur de `view` inconnue", () => {
    pathnameMock.value = "/w/world-1";
    searchParamsMock.value = new URLSearchParams("view=inconnu");
    expect(renderShell()).toHaveClass("hidden");
  });
});

describe("AppShell — rail des mondes (temporairement masqué)", () => {
  // WORLDS_RAIL_ENABLED = false dans AppShell.tsx : la fonctionnalité est
  // remplacée par le panneau « favoris » intégré au rail d'icônes
  // (WorldsQuickAccess, cf. SidebarRail.tsx) mais le code du rail dédié
  // reste en place pour un retour en arrière facile. Ces tests vérifient
  // qu'il ne s'affiche plus nulle part tant que le flag est désactivé.

  it("ne rend le rail des mondes ni en desktop ni dans le drawer, même avec plusieurs mondes rejoints", () => {
    render(
      <AppShell rail={<div>rail</div>} worlds={WORLDS}>
        <div>contenu</div>
      </AppShell>,
    );
    expect(screen.queryByLabelText("Monde un")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Monde deux")).not.toBeInTheDocument();
  });

  it("ne rend pas non plus le lien Explorer du rail des mondes quand le flag public_worlds est actif", () => {
    publicWorldsMock.value = true;
    render(
      <AppShell rail={<div>rail</div>} worlds={[]}>
        <div>contenu</div>
      </AppShell>,
    );
    expect(screen.queryByLabelText("Explorer")).not.toBeInTheDocument();
  });
});
