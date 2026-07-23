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

vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ notifications: false, direct_messages: false }),
}));

vi.mock("@/components/providers/NotificationsProvider", () => ({
  useNotifications: () => ({ panelOpen: false, closePanel: vi.fn() }),
}));

vi.mock("@/components/providers/DmsProvider", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDms: () => ({ panelOpen: false, closePanel: vi.fn() }),
}));

beforeEach(() => {
  pathnameMock.value = "/w/world-1";
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
