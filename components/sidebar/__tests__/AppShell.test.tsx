import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AppShell from "@/components/sidebar/AppShell";

// Évite les soucis de portail Radix dans jsdom (même convention que
// ChatroomMessage.header.test.tsx pour Sheet/Popover/Drawer/...).
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const pathnameMock = vi.hoisted(() => ({ value: "/w/world-1" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock.value,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ notifications: false, direct_messages: false }),
}));

const notifPanelOpenMock = vi.hoisted(() => ({ value: false }));
vi.mock("@/components/providers/NotificationsProvider", () => ({
  useNotifications: () => ({ panelOpen: notifPanelOpenMock.value, closePanel: vi.fn(), worldUnread: {} }),
}));

const dmsPanelOpenMock = vi.hoisted(() => ({ value: false }));
vi.mock("@/components/providers/DmsProvider", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDms: () => ({ panelOpen: dmsPanelOpenMock.value, closePanel: vi.fn() }),
}));

const WORLDS = [
  { id: "world-1", name: "Monde un", icon_url: null },
  { id: "world-2", name: "Monde deux", icon_url: null },
];

beforeEach(() => {
  pathnameMock.value = "/w/world-1";
  notifPanelOpenMock.value = false;
  dmsPanelOpenMock.value = false;
});

describe("AppShell — barre mobile générique vs header de chatroom", () => {
  it("affiche le bouton menu générique sur une page non-chatroom (ex: monde)", () => {
    pathnameMock.value = "/w/world-1";
    render(
      <AppShell rail={<div>rail</div>}>
        <div>contenu</div>
      </AppShell>,
    );
    const button = screen.getByLabelText("Ouvrir le menu");
    const header = button.closest("header");
    expect(header).not.toHaveClass("hidden");
  });

  it("masque la barre générique sur une page de chatroom — ChatroomHeader prend le relais avec son propre bouton menu", () => {
    pathnameMock.value = "/c/chat-1";
    render(
      <AppShell rail={<div>rail</div>}>
        <div>contenu</div>
      </AppShell>,
    );
    const button = screen.getByLabelText("Ouvrir le menu");
    const header = button.closest("header");
    expect(header).toHaveClass("hidden");
  });
});

describe("AppShell — rail des mondes dans le drawer mobile", () => {
  it("affiche le rail des mondes quand plus d'un monde est rejoint et aucun panneau n'est ouvert", () => {
    render(
      <AppShell rail={<div>rail</div>} worlds={WORLDS}>
        <div>contenu</div>
      </AppShell>,
    );
    expect(screen.getByLabelText("Monde un")).toBeInTheDocument();
    expect(screen.getByLabelText("Monde deux")).toBeInTheDocument();
  });

  it("masque le rail des mondes quand le panneau notifications est ouvert, pour lui laisser toute la place", () => {
    notifPanelOpenMock.value = true;
    render(
      <AppShell rail={<div>rail</div>} worlds={WORLDS}>
        <div>contenu</div>
      </AppShell>,
    );
    expect(screen.queryByLabelText("Monde un")).not.toBeInTheDocument();
  });

  it("masque le rail des mondes quand le panneau DMs est ouvert", () => {
    dmsPanelOpenMock.value = true;
    render(
      <AppShell rail={<div>rail</div>} worlds={WORLDS}>
        <div>contenu</div>
      </AppShell>,
    );
    expect(screen.queryByLabelText("Monde un")).not.toBeInTheDocument();
  });

  it("affiche le rail même avec un seul monde rejoint — seul lien mobile vers ce monde hors de ses pages", () => {
    render(
      <AppShell rail={<div>rail</div>} worlds={[WORLDS[0]]}>
        <div>contenu</div>
      </AppShell>,
    );
    expect(screen.getByLabelText("Monde un")).toBeInTheDocument();
  });

  it("ne rend pas de rail des mondes si l'utilisateur n'a rejoint aucun monde", () => {
    render(
      <AppShell rail={<div>rail</div>} worlds={[]}>
        <div>contenu</div>
      </AppShell>,
    );
    expect(screen.queryByLabelText("Monde un")).not.toBeInTheDocument();
  });
});
