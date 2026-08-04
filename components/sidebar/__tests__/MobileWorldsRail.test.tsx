import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileWorldsRail } from "@/components/sidebar/MobileWorldsRail";

const worldUnreadMock = vi.hoisted(() => ({ value: {} as Record<string, number> }));
const pathnameMock = vi.hoisted(() => ({ value: "/w/world-1" }));
const activeWorldIdMock = vi.hoisted(() => ({ value: null as string | null }));
const publicWorldsMock = vi.hoisted(() => ({ value: false }));

vi.mock("@/components/providers/NotificationsProvider", () => ({
  useNotifications: () => ({ worldUnread: worldUnreadMock.value }),
}));

vi.mock("@/components/providers/MobileSidebarProvider", () => ({
  useMobileSidebar: () => ({ activeWorldId: activeWorldIdMock.value }),
}));

vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ public_worlds: publicWorldsMock.value }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (key === "explore" ? "Explorer" : key),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock.value,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

beforeEach(() => {
  publicWorldsMock.value = false;
});

const WORLDS = [
  { id: "world-1", name: "Final Cocktasy", icon_url: null },
  { id: "world-2", name: "Autre monde", icon_url: null },
];

describe("MobileWorldsRail", () => {
  it("affiche une icône par monde rejoint, liée à /w/[id]", () => {
    worldUnreadMock.value = {};
    pathnameMock.value = "/w/world-1";
    activeWorldIdMock.value = null;
    render(<MobileWorldsRail worlds={WORLDS} />);

    const link1 = screen.getByLabelText("Final Cocktasy");
    const link2 = screen.getByLabelText("Autre monde");
    expect(link1).toHaveAttribute("href", "/w/world-1");
    expect(link2).toHaveAttribute("href", "/w/world-2");
  });

  it("marque le monde courant (déduit du pathname) comme actif", () => {
    worldUnreadMock.value = {};
    pathnameMock.value = "/w/world-2";
    activeWorldIdMock.value = null;
    render(<MobileWorldsRail worlds={WORLDS} />);

    expect(screen.getByLabelText("Autre monde")).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Final Cocktasy")).not.toHaveAttribute("aria-current");
  });

  it("n'active aucune icône hors des pages d'un monde", () => {
    worldUnreadMock.value = {};
    pathnameMock.value = "/explore";
    activeWorldIdMock.value = null;
    render(<MobileWorldsRail worlds={WORLDS} />);

    expect(screen.getByLabelText("Final Cocktasy")).not.toHaveAttribute("aria-current");
    expect(screen.getByLabelText("Autre monde")).not.toHaveAttribute("aria-current");
  });

  it("sur une page de chatroom (/c/[id]), retombe sur activeWorldId pour marquer le monde actif", () => {
    worldUnreadMock.value = {};
    pathnameMock.value = "/c/some-chat-id";
    activeWorldIdMock.value = "world-2";
    render(<MobileWorldsRail worlds={WORLDS} />);

    expect(screen.getByLabelText("Autre monde")).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Final Cocktasy")).not.toHaveAttribute("aria-current");
  });

  it("le pathname `/w/[id]` reste prioritaire sur activeWorldId", () => {
    worldUnreadMock.value = {};
    pathnameMock.value = "/w/world-1";
    activeWorldIdMock.value = "world-2";
    render(<MobileWorldsRail worlds={WORLDS} />);

    expect(screen.getByLabelText("Final Cocktasy")).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Autre monde")).not.toHaveAttribute("aria-current");
  });

  it("superpose le badge de non-lu sur l'icône du monde concerné", () => {
    worldUnreadMock.value = { "world-2": 5 };
    pathnameMock.value = "/w/world-1";
    activeWorldIdMock.value = null;
    render(<MobileWorldsRail worlds={WORLDS} />);

    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("plafonne l'affichage du badge à 99+", () => {
    worldUnreadMock.value = { "world-1": 150 };
    pathnameMock.value = "/w/world-1";
    activeWorldIdMock.value = null;
    render(<MobileWorldsRail worlds={WORLDS} />);

    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("affiche le lien Explorer en tête de liste quand le flag public_worlds est actif", () => {
    publicWorldsMock.value = true;
    pathnameMock.value = "/w/world-1";
    render(<MobileWorldsRail worlds={WORLDS} />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/explore");
    expect(links[0]).toHaveAccessibleName("Explorer");
  });

  it("masque le lien Explorer quand le flag public_worlds est désactivé", () => {
    publicWorldsMock.value = false;
    render(<MobileWorldsRail worlds={WORLDS} />);

    expect(screen.queryByLabelText("Explorer")).not.toBeInTheDocument();
  });

  it("marque le lien Explorer comme actif sur /explore", () => {
    publicWorldsMock.value = true;
    pathnameMock.value = "/explore";
    render(<MobileWorldsRail worlds={WORLDS} />);

    expect(screen.getByLabelText("Explorer")).toHaveAttribute("aria-current", "page");
  });
});
