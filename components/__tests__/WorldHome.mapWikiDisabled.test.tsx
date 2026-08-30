import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/app/(protected)/w/actions", () => ({
  saveWorldPrefs: vi.fn(),
  toggleWorldFavorite: vi.fn(),
}));

// `world_map` levé : ce fichier teste le réglage PAR MONDE, pas le drapeau global.
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({
    create_chatroom: true,
    world_map: true,
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
vi.mock("@/components/worlds/map/WorldMap", () => ({
  WorldMap: () => <div data-testid="carte" />,
}));
vi.mock("@/components/worlds/wiki/WorldWiki", () => ({
  WorldWiki: () => <div data-testid="wiki" />,
}));

import { WorldHome } from "@/components/worlds/home/WorldHome";

// ──────────────────────────────────────────────────────────────────────────
// Carte et wiki sont désormais activables par monde. Masquer le lien dans la
// navigation ne suffit pas : `?view=map` reste tapable dans la barre d'adresse,
// et un lien partagé avant la désactivation continue de circuler.
//
// Ces tests fixent le comportement d'une section désactivée : elle ne s'affiche
// pas, et la page retombe sur l'accueil du monde plutôt que sur du vide.
// ──────────────────────────────────────────────────────────────────────────

type Reglages = { enable_map?: boolean; enable_wiki?: boolean };

type ProprietesWorldHome = React.ComponentProps<typeof WorldHome>;

function monter(view: "map" | "wiki", reglages: Reglages) {
  render(
    <WorldHome
      {...({
        world: {
          id: "world-1",
          name: "Monde",
          owner_id: "user-1",
          home_layout: ["chatrooms"],
          ...reglages,
        },
        worldId: "world-1",
        userId: "user-1",
        canAdmin: false,
        isShared: true,
        canEditTabs: false,
        canPost: true,
        initialRooms: [],
        initialPersonas: [],
        initialPrefs: null,
        view,
      } as unknown as ProprietesWorldHome)}
    />,
  );
}

// `WorldMap` et `WorldWiki` sont chargés par `dynamic()` : leur rendu n'est
// pas synchrone, d'où `findByTestId` là où on les attend.
describe("WorldHome — carte et wiki désactivés par monde", () => {
  it("affiche la carte quand elle est activée", async () => {
    monter("map", { enable_map: true });
    expect(await screen.findByTestId("carte")).toBeInTheDocument();
  });

  it("refuse `?view=map` quand la carte est désactivée", () => {
    monter("map", { enable_map: false });
    expect(screen.queryByTestId("carte")).toBeNull();
    // Repli sur l'accueil : la page reste utilisable, elle ne se vide pas.
    expect(screen.getByTestId("chatrooms")).toBeInTheDocument();
  });

  it("affiche le wiki quand il est activé", async () => {
    monter("wiki", { enable_wiki: true });
    expect(await screen.findByTestId("wiki")).toBeInTheDocument();
  });

  it("refuse `?view=wiki` quand le wiki est désactivé", () => {
    monter("wiki", { enable_wiki: false });
    expect(screen.queryByTestId("wiki")).toBeNull();
    expect(screen.getByTestId("chatrooms")).toBeInTheDocument();
  });

  it("traite l'absence de réglage comme « activé »", async () => {
    // La colonne est `NOT NULL DEFAULT true` en base, mais un monde partiel
    // peut arriver sans elle : l'absence ne doit pas se lire « désactivé ».
    monter("map", {});
    expect(await screen.findByTestId("carte")).toBeInTheDocument();
  });
});
