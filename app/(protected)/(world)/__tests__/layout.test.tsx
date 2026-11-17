import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Le layout commun aux mondes et aux salons porte la barre latérale. Il choisit
 * son monde d'après le chemin, et ne l'affiche que là où `w/[id]/layout.tsx`
 * laisse entrer : jamais devant une 404 ni devant l'écran d'âge.
 */

const state = vi.hoisted(() => ({
  pathname: null as string | null,
  chatroom: null as { world_id: string | null } | null,
  world: null as { is_age_restricted?: boolean; world_members?: { user_id: string; age_confirmed_at: string | null }[] } | null,
  membership: null as object | null,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-wvlds-pathname", state.pathname]]),
}));
vi.mock("@/lib/currentRequest", () => ({
  getCurrentUserId: async () => "moi",
  getWorldById: async () => state.world,
  getWorldMembership: async () => ({ roles: [], membership: state.membership }),
}));
vi.mock("@/app/(protected)/(world)/c/[id]/getChatroom", () => ({
  getChatroomWithWorld: async () => ({ data: state.chatroom, error: null }),
}));
vi.mock("@/components/worlds/sidebar/WorldSidebar", () => ({
  default: ({ worldId }: { worldId: string }) => <aside data-testid="sidebar">{worldId}</aside>,
}));

import WorldAreaLayout from "../layout";

async function rendre() {
  render(await WorldAreaLayout({ children: <div>page</div> }));
}

beforeEach(() => {
  state.pathname = null;
  state.chatroom = null;
  state.world = { is_age_restricted: false, world_members: [] };
  state.membership = {};
});

describe("layout (world) — barre latérale", () => {
  it("sur un salon : la barre du monde du salon", async () => {
    state.pathname = "/c/salon-1";
    state.chatroom = { world_id: "monde-a" };
    await rendre();
    expect(await screen.findByTestId("sidebar")).toHaveTextContent("monde-a");
    expect(screen.getByText("page")).toBeInTheDocument();
  });

  it("sur une page de monde dont on est membre : la barre de ce monde", async () => {
    state.pathname = "/w/monde-b";
    await rendre();
    expect(await screen.findByTestId("sidebar")).toHaveTextContent("monde-b");
  });

  it("pas de barre pour un non-membre (la page rend une 404)", async () => {
    state.pathname = "/w/monde-b";
    state.membership = null;
    await rendre();
    expect(screen.queryByTestId("sidebar")).toBeNull();
    expect(screen.getByText("page")).toBeInTheDocument();
  });

  it("pas de barre devant l'écran d'âge", async () => {
    state.pathname = "/w/monde-b";
    state.world = { is_age_restricted: true, world_members: [{ user_id: "moi", age_confirmed_at: null }] };
    await rendre();
    expect(screen.queryByTestId("sidebar")).toBeNull();
  });

  it("la barre d'un monde réservé dont l'âge est confirmé", async () => {
    state.pathname = "/w/monde-b";
    state.world = { is_age_restricted: true, world_members: [{ user_id: "moi", age_confirmed_at: "2026-01-01" }] };
    await rendre();
    expect(await screen.findByTestId("sidebar")).toHaveTextContent("monde-b");
  });

  it("pas de barre sans chemin connu", async () => {
    await rendre();
    expect(screen.queryByTestId("sidebar")).toBeNull();
  });
});
