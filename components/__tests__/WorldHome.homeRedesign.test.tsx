import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({
    create_chatroom: false,
    world_map: false,
    world_catalogue: false,
    world_timeline: false,
  }),
}));

vi.mock("@/app/(protected)/w/actions", () => ({
  saveWorldPrefs: vi.fn(),
  toggleWorldFavorite: vi.fn(),
}));

vi.mock("@/components/worlds/home/WorldHeroCard", () => ({
  WorldHeroCard: () => <div>hero</div>,
}));

vi.mock("@/components/worlds/chatrooms/WorldChatroomsGrid", () => ({
  WorldChatroomsGrid: () => <div>grid</div>,
}));

vi.mock("@/components/worlds/chatrooms/WorldCategoryFolders", () => ({
  WorldCategoryFolders: () => <div>folders</div>,
}));

vi.mock("@/components/worlds/home/widgets/WorldStatsWidget", () => ({
  WorldStatsWidget: () => <div>stats-widget</div>,
}));

import { WorldHome } from "@/components/worlds/home/WorldHome";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    world: { id: "world-1", name: "Avalonia", description: "Un monde de test", owner_id: "user-1" },
    worldId: "world-1",
    userId: "user-1",
    canAdmin: false,
    isShared: true,
    canEditTabs: false,
    canPost: false,
    initialRooms: [],
    initialPersonas: [],
    initialPrefs: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldHome — titre/description hors bannière + panel de contenu", () => {
  it("affiche le titre et la description comme contenu de page (plus superposés sur la bannière)", () => {
    render(<WorldHome {...baseProps()} />);

    expect(screen.getByRole("heading", { name: "Avalonia" })).toBeInTheDocument();
    expect(screen.getByText("Un monde de test")).toBeInTheDocument();
  });

  it("n'affiche pas les statistiques quand le widget n'est pas activé", async () => {
    render(<WorldHome {...baseProps({ world: { id: "world-1", name: "Avalonia", owner_id: "user-1", home_layout: ["chatrooms"] } })} />);

    await screen.findByText("grid");
    expect(screen.queryByText("stats-widget")).not.toBeInTheDocument();
  });

  it("les statistiques sont un bloc de la grille comme un autre, dans le panel", async () => {
    // La refonte visuelle épinglait les stats sous le titre, hors du panel.
    // Avec la grille, ce cas particulier disparaît : l'admin place ce bloc
    // où il veut, au même titre que les autres.
    render(
      <WorldHome {...baseProps({ world: { id: "world-1", name: "Avalonia", owner_id: "user-1", home_layout: ["stats", "chatrooms"] } })} />,
    );

    const stats = await screen.findByText("stats-widget");
    const panel = screen.getByText("grid").closest("[data-home-panel]");
    expect(panel).toBeTruthy();
    expect(panel?.contains(stats)).toBe(true);
  });

  it("le panel contient les widgets restants dans l'ordre configuré", () => {
    render(
      <WorldHome {...baseProps({ world: { id: "world-1", name: "Avalonia", owner_id: "user-1", home_layout: ["stats", "chatrooms"] } })} />,
    );

    const panel = screen.getByText("grid").closest("[data-home-panel]");
    expect(panel).toBeTruthy();
  });

  it("le bloc titre est positionné (relative) pour se peindre au-dessus du fond absolu de la bannière", () => {
    // Régression : un bloc statique (sans position) se peint SOUS un élément
    // absolute quel que soit son ordre dans le DOM (règles d'empilement CSS)
    // — sans `relative` ici, le titre/description/stats devient invisible,
    // masqué par le dégradé opaque de WorldHeroCard.
    render(<WorldHome {...baseProps()} />);

    const heading = screen.getByRole("heading", { name: "Avalonia" });
    const titleBlock = heading.closest("div.relative");
    expect(titleBlock).not.toBeNull();
  });
});
