import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}));

vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({
    create_chatroom: false,
    world_map: false,
    world_catalogue: false,
    world_timeline: false,
  }),
}));

const toggleWorldFavorite = vi.fn();
vi.mock("@/app/(protected)/w/actions", () => ({
  toggleWorldFavorite: (...args: unknown[]) => toggleWorldFavorite(...args),
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

import { WorldHome } from "@/components/worlds/home/WorldHome";

function baseProps() {
  return {
    world: { id: "world-1", name: "Avalonia", owner_id: "user-1" },
    worldId: "world-1",
    userId: "user-1",
    canAdmin: false,
    isShared: true,
    canEditTabs: false,
    canPost: false,
    initialRooms: [],
    initialPersonas: [],
  };
}

beforeEach(() => {
  toggleWorldFavorite.mockClear();
});

describe("WorldHome — pas de header séparé ni d'option plein écran, boutons incrustés sur la bannière", () => {
  it("n'affiche aucune option plein écran (toujours pleine largeur)", () => {
    render(<WorldHome {...baseProps()} initialPrefs={{ main_expanded: false, is_favorite: false }} />);

    expect(screen.queryByLabelText("Plein écran")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Réduire")).not.toBeInTheDocument();
  });

  it("affiche le bouton menu mobile incrusté sur la bannière", () => {
    render(<WorldHome {...baseProps()} initialPrefs={{ main_expanded: false, is_favorite: false }} />);

    expect(screen.getByLabelText("Ouvrir le menu")).toBeInTheDocument();
  });

  it("affiche le bouton favoris incrusté sur la bannière", () => {
    render(<WorldHome {...baseProps()} initialPrefs={{ main_expanded: false, is_favorite: false }} />);

    expect(screen.getByLabelText("Ajouter aux favoris")).toBeInTheDocument();
  });

  it("le bouton favoris bascule la préférence et son libellé", async () => {
    const user = userEvent.setup();
    render(<WorldHome {...baseProps()} initialPrefs={{ main_expanded: false, is_favorite: false }} />);

    await user.click(screen.getByLabelText("Ajouter aux favoris"));

    expect(toggleWorldFavorite).toHaveBeenCalledWith("world-1", true);
    expect(screen.getByLabelText("Retirer des favoris")).toBeInTheDocument();
  });
});
