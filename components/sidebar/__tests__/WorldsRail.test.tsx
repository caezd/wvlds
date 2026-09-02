import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { WorldsRail } from "@/components/sidebar/WorldsRail";

const worldUnreadMock = vi.hoisted(() => ({ value: {} as Record<string, number> }));
const pathnameMock = vi.hoisted(() => ({ value: "/w/world-1" }));
const activeWorldIdMock = vi.hoisted(() => ({ value: null as string | null }));
const publicWorldsMock = vi.hoisted(() => ({ value: false }));
const currentUserIdMock = vi.hoisted(() => ({ value: null as string | null }));
const leaveWorldMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("@/components/providers/NotificationsProvider", () => ({
  useNotifications: () => ({ worldUnread: worldUnreadMock.value }),
}));

vi.mock("@/components/providers/MobileSidebarProvider", () => ({
  useMobileSidebar: () => ({ activeWorldId: activeWorldIdMock.value }),
}));

vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ public_worlds: publicWorldsMock.value }),
}));

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: currentUserIdMock.value }),
}));

vi.mock("@/app/actions/worlds", () => ({
  leaveWorld: leaveWorldMock,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (key === "explore" ? "Explorer" : key),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock.value,
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

/** Simule un point de contact grossier (mobile/tactile), cf. `mockCoarsePointer` dans ChatroomMessage.editMobile.test.tsx. */
function mockCoarsePointer(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(pointer: coarse)" ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  publicWorldsMock.value = false;
  currentUserIdMock.value = null;
  leaveWorldMock.mockClear();
  mockCoarsePointer(false);
});

const WORLDS = [
  { id: "world-1", name: "Final Cocktasy", icon_url: null, owner_id: "owner-1" },
  { id: "world-2", name: "Autre monde", icon_url: null, owner_id: "owner-2" },
];

const QUOTA_OK = { plan: "free" as const, owned: 0, quotaLimit: 1, quotaReached: false };
const QUOTA_REACHED = { plan: "free" as const, owned: 1, quotaLimit: 1, quotaReached: true };

describe("WorldsRail", () => {
  it("affiche une icône par monde rejoint, liée à /w/[id]", () => {
    worldUnreadMock.value = {};
    pathnameMock.value = "/w/world-1";
    activeWorldIdMock.value = null;
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    const link1 = screen.getByLabelText("Final Cocktasy");
    const link2 = screen.getByLabelText("Autre monde");
    expect(link1).toHaveAttribute("href", "/w/world-1");
    expect(link2).toHaveAttribute("href", "/w/world-2");
  });

  it("marque le monde courant (déduit du pathname) comme actif", () => {
    worldUnreadMock.value = {};
    pathnameMock.value = "/w/world-2";
    activeWorldIdMock.value = null;
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    expect(screen.getByLabelText("Autre monde")).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Final Cocktasy")).not.toHaveAttribute("aria-current");
  });

  it("n'active aucune icône hors des pages d'un monde", () => {
    worldUnreadMock.value = {};
    pathnameMock.value = "/explore";
    activeWorldIdMock.value = null;
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    expect(screen.getByLabelText("Final Cocktasy")).not.toHaveAttribute("aria-current");
    expect(screen.getByLabelText("Autre monde")).not.toHaveAttribute("aria-current");
  });

  it("sur une page de chatroom (/c/[id]), retombe sur activeWorldId pour marquer le monde actif", () => {
    worldUnreadMock.value = {};
    pathnameMock.value = "/c/some-chat-id";
    activeWorldIdMock.value = "world-2";
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    expect(screen.getByLabelText("Autre monde")).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Final Cocktasy")).not.toHaveAttribute("aria-current");
  });

  it("le pathname `/w/[id]` reste prioritaire sur activeWorldId", () => {
    worldUnreadMock.value = {};
    pathnameMock.value = "/w/world-1";
    activeWorldIdMock.value = "world-2";
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    expect(screen.getByLabelText("Final Cocktasy")).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Autre monde")).not.toHaveAttribute("aria-current");
  });

  it("superpose le badge de non-lu sur l'icône du monde concerné", () => {
    worldUnreadMock.value = { "world-2": 5 };
    pathnameMock.value = "/w/world-1";
    activeWorldIdMock.value = null;
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("plafonne l'affichage du badge à 99+", () => {
    worldUnreadMock.value = { "world-1": 150 };
    pathnameMock.value = "/w/world-1";
    activeWorldIdMock.value = null;
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("affiche le lien Explorer en tête de liste quand le flag public_worlds est actif", () => {
    publicWorldsMock.value = true;
    pathnameMock.value = "/w/world-1";
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/explore");
    expect(links[0]).toHaveAccessibleName("Explorer");
  });

  it("masque le lien Explorer quand le flag public_worlds est désactivé", () => {
    publicWorldsMock.value = false;
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    expect(screen.queryByLabelText("Explorer")).not.toBeInTheDocument();
  });

  it("marque le lien Explorer comme actif sur /explore", () => {
    publicWorldsMock.value = true;
    pathnameMock.value = "/explore";
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    expect(screen.getByLabelText("Explorer")).toHaveAttribute("aria-current", "page");
  });

  it("affiche le CTA de création de monde quand le quota n'est pas atteint", () => {
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    expect(screen.getByLabelText("create")).toBeInTheDocument();
  });

  it("masque le CTA de création de monde quand le quota est atteint", () => {
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_REACHED} />);

    expect(screen.queryByLabelText("create")).not.toBeInTheDocument();
  });
});

describe("WorldsRail — quitter un monde", () => {
  it("affiche l'option Quitter (clic droit, desktop) pour tous les mondes, désactivée pour ceux dont on est propriétaire", () => {
    currentUserIdMock.value = "owner-1"; // propriétaire de world-1, pas de world-2
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    fireEvent.contextMenu(screen.getByLabelText("Final Cocktasy"));
    expect(screen.getByRole("menuitem", { name: "leave" })).toHaveAttribute("aria-disabled", "true");

    fireEvent.contextMenu(screen.getByLabelText("Autre monde"));
    expect(screen.getByRole("menuitem", { name: "leave" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("un clic sur l'option Quitter désactivée (propriétaire) n'ouvre pas la confirmation", () => {
    currentUserIdMock.value = "owner-1";
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    fireEvent.contextMenu(screen.getByLabelText("Final Cocktasy"));
    fireEvent.click(screen.getByRole("menuitem", { name: "leave" }));

    expect(screen.queryByText("leaveConfirmTitle")).not.toBeInTheDocument();
  });

  it("ouvre la confirmation puis appelle leaveWorld en sélectionnant Quitter dans le menu contextuel", async () => {
    currentUserIdMock.value = "member-1"; // pas propriétaire d'aucun des deux mondes
    render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

    fireEvent.contextMenu(screen.getByLabelText("Final Cocktasy"));
    fireEvent.click(screen.getByText("leave"));

    // La confirmation s'ouvre une fois le menu contextuel refermé (voir
    // `afterMenuClose`) : elle n'est donc pas là au tick suivant le clic.
    expect(await screen.findByText("leaveConfirmTitle")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("leaveConfirmContinue"));
    });

    // Radix rend `document.body` inerte tant qu'une couche modale vit ; le
    // menu contextuel et la confirmation se chevauchent. Sans `afterMenuClose`,
    // le verrou reste posé et plus rien n'est cliquable (voir ce module).
    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe("none"));

    expect(leaveWorldMock).toHaveBeenCalledWith("world-1");
  });

  it("sur mobile, un appui long ouvre un drawer avec l'option Quitter (pas le menu contextuel)", () => {
    mockCoarsePointer(true);
    currentUserIdMock.value = "member-1";
    vi.useFakeTimers();
    try {
      render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

      expect(screen.queryByText("leave")).not.toBeInTheDocument();

      fireEvent.touchStart(screen.getByLabelText("Final Cocktasy"));
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByText("leave")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sur mobile, l'appui long ouvre quand même le drawer pour le monde dont on est propriétaire, mais l'option Quitter y est désactivée", () => {
    mockCoarsePointer(true);
    currentUserIdMock.value = "owner-1";
    vi.useFakeTimers();
    try {
      render(<WorldsRail worlds={WORLDS} quota={QUOTA_OK} />);

      fireEvent.touchStart(screen.getByLabelText("Final Cocktasy"));
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByRole("button", { name: /leave/i })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });
});
