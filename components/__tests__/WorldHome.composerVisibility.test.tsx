import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/app/(protected)/w/actions", () => ({
  saveWorldPrefs: vi.fn(),
  toggleWorldFavorite: vi.fn(),
}));

// create_chatroom fixé à true ici : ce fichier teste uniquement l'effet de
// `canPost` (prop par rendu), pas celui du feature flag lui-même.
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({
    create_chatroom: true,
    world_map: false,
    world_catalogue: false,
    world_timeline: false,
  }),
}));

vi.mock("@/components/worlds/home/WorldHeroCard", () => ({
  WorldHeroCard: () => <div>hero</div>,
}));

vi.mock("@/components/worlds/chatrooms/WorldChatComposer", () => ({
  WorldChatComposer: () => <div data-testid="composer" />,
}));
vi.mock("@/components/worlds/chatrooms/WorldChatroomsGrid", () => ({
  WorldChatroomsGrid: () => <div data-testid="chatrooms" />,
}));
vi.mock("@/components/worlds/chatrooms/WorldCategoryFolders", () => ({
  WorldCategoryFolders: () => <div data-testid="categories" />,
}));

import { WorldHome } from "@/components/worlds/home/WorldHome";

function baseProps(canPost: boolean) {
  return {
    world: { id: "world-1", name: "Monde", owner_id: "user-1", home_layout: ["categories", "composer", "chatrooms"] },
    worldId: "world-1",
    userId: "user-1",
    canAdmin: false,
    isShared: true,
    canEditTabs: false,
    canPost,
    initialRooms: [],
    initialPersonas: [],
    initialPrefs: null,
  };
}

describe("WorldHome — visibilité du bloc composer dans la grille", () => {
  it("n'affiche pas de trou vide : le bloc composer est retiré de la grille quand l'utilisateur ne peut pas poster", () => {
    render(<WorldHome {...baseProps(false)} />);

    expect(screen.getByTestId("categories")).toBeInTheDocument();
    expect(screen.getByTestId("chatrooms")).toBeInTheDocument();
    expect(screen.queryByTestId("composer")).not.toBeInTheDocument();
  });

  it("affiche le bloc composer quand l'utilisateur peut poster", () => {
    render(<WorldHome {...baseProps(true)} />);

    expect(screen.getByTestId("composer")).toBeInTheDocument();
  });
});
