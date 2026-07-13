import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

vi.mock("@/app/(protected)/w/actions", () => ({
  saveWorldPrefs: vi.fn(),
  toggleWorldFavorite: vi.fn(),
}));

vi.mock("@/components/worlds/home/WorldHeroCard", () => ({
  WorldHeroCard: () => <div>hero</div>,
}));

vi.mock("@/components/worlds/chatrooms/WorldChatroomsGrid", () => ({
  WorldChatroomsGrid: ({ categoryId }: { categoryId: string | null }) => (
    <div>grid-category:{categoryId ?? "none"}</div>
  ),
}));

vi.mock("@/components/worlds/chatrooms/WorldCategoryFolders", () => ({
  WorldCategoryFolders: ({
    selectedCategoryId,
    onSelectCategory,
  }: {
    selectedCategoryId: string | null;
    onSelectCategory: (id: string | null) => void;
  }) => (
    <div>
      <span>folders-selected:{selectedCategoryId ?? "none"}</span>
      <button onClick={() => onSelectCategory("cat-1")}>select-cat-1</button>
      <button onClick={() => onSelectCategory(null)}>deselect</button>
    </div>
  ),
}));

import { WorldHome } from "@/components/worlds/home/WorldHome";

function baseProps() {
  return {
    world: { id: "world-1", name: "Monde", owner_id: "user-1" },
    worldId: "world-1",
    userId: "user-1",
    canAdmin: false,
    isShared: true,
    canEditTabs: false,
    canPost: false,
    initialRooms: [],
    initialPersonas: [],
    initialPrefs: null,
  };
}

describe("WorldHome — persistance de la catégorie sélectionnée dans l'URL", () => {
  beforeEach(() => {
    replace.mockClear();
    refresh.mockClear();
  });

  it("initialise la sélection depuis initialCategoryId (lu depuis l'URL au chargement)", () => {
    render(<WorldHome {...baseProps()} initialCategoryId="cat-1" />);

    expect(screen.getByText((_, node) => node?.textContent === "folders-selected:cat-1")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === "grid-category:cat-1")).toBeInTheDocument();
  });

  it("met à jour l'URL avec ?category=<id> quand on sélectionne une catégorie", () => {
    render(<WorldHome {...baseProps()} />);

    fireEvent.click(screen.getByText("select-cat-1"));

    expect(replace).toHaveBeenCalledWith("/w/world-1?category=cat-1", { scroll: false });
    expect(screen.getByText((_, node) => node?.textContent === "folders-selected:cat-1")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === "grid-category:cat-1")).toBeInTheDocument();
  });

  it("retire le paramètre de l'URL quand on désélectionne", () => {
    render(<WorldHome {...baseProps()} initialCategoryId="cat-1" />);

    fireEvent.click(screen.getByText("deselect"));

    expect(replace).toHaveBeenCalledWith("/w/world-1", { scroll: false });
    expect(screen.getByText((_, node) => node?.textContent === "folders-selected:none")).toBeInTheDocument();
  });
});
