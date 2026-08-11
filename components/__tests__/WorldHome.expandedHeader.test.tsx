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

const saveWorldPrefs = vi.fn();
const toggleWorldFavorite = vi.fn();
vi.mock("@/app/(protected)/w/actions", () => ({
  saveWorldPrefs: (...args: unknown[]) => saveWorldPrefs(...args),
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
  saveWorldPrefs.mockClear();
  toggleWorldFavorite.mockClear();
});

describe("WorldHome — header classique toujours affiché (au lieu des boutons flottés sur la bannière)", () => {
  it("affiche le header avec le nom du monde et l'action agrandir quand le mode plein écran est désactivé", () => {
    render(<WorldHome {...baseProps()} initialPrefs={{ main_expanded: false, is_favorite: false }} />);

    expect(screen.getByText("Avalonia")).toBeInTheDocument();
    expect(screen.getByLabelText("Plein écran")).toBeInTheDocument();
    expect(screen.queryByLabelText("Réduire")).not.toBeInTheDocument();
  });

  it("affiche le header avec le nom du monde et l'action réduire en plein écran", () => {
    render(<WorldHome {...baseProps()} initialPrefs={{ main_expanded: true, is_favorite: false }} />);

    expect(screen.getByText("Avalonia")).toBeInTheDocument();
    expect(screen.getByLabelText("Réduire")).toBeInTheDocument();
    expect(screen.getByLabelText("Ajouter aux favoris")).toBeInTheDocument();
  });

  it("le bouton réduire quitte le plein écran, persiste la préférence et bascule vers l'action agrandir", async () => {
    const user = userEvent.setup();
    render(<WorldHome {...baseProps()} initialPrefs={{ main_expanded: true, is_favorite: false }} />);

    await user.click(screen.getByLabelText("Réduire"));

    expect(saveWorldPrefs).toHaveBeenCalledWith("world-1", { main_expanded: false });
    expect(screen.getByText("Avalonia")).toBeInTheDocument();
    expect(screen.getByLabelText("Plein écran")).toBeInTheDocument();
  });

  it("le bouton agrandir depuis le header compact passe en plein écran et persiste la préférence", async () => {
    const user = userEvent.setup();
    render(<WorldHome {...baseProps()} initialPrefs={{ main_expanded: false, is_favorite: false }} />);

    await user.click(screen.getByLabelText("Plein écran"));

    expect(saveWorldPrefs).toHaveBeenCalledWith("world-1", { main_expanded: true });
    expect(screen.getByLabelText("Réduire")).toBeInTheDocument();
  });

  it("le bouton favoris depuis le header bascule la préférence", async () => {
    const user = userEvent.setup();
    render(<WorldHome {...baseProps()} initialPrefs={{ main_expanded: true, is_favorite: false }} />);

    await user.click(screen.getByLabelText("Ajouter aux favoris"));

    expect(toggleWorldFavorite).toHaveBeenCalledWith("world-1", true);
    expect(screen.getByLabelText("Retirer des favoris")).toBeInTheDocument();
  });
});
