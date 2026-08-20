import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const mockGetUserPresence = vi.fn<(userId?: string | null) => "online" | "away" | "offline">(
  () => "offline",
);
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: mockGetUserPresence }),
}));

import { WorldMembersPanel } from "@/components/worlds/members/WorldMembersPanel";

function setup() {
  const mock = createSupabaseMock({
    results: [
      { data: { owner_id: "u1" } },
      { data: [{ user_id: "u1", role: "owner" }, { user_id: "u2", role: "player" }] },
      { data: [{ id: "u1", username: "alice", avatar_url: null }, { id: "u2", username: "bob", avatar_url: null }] },
      { data: [] },
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserPresence.mockReturnValue("offline");
});

describe("WorldMembersPanel — pastille de présence", () => {
  it("affiche une pastille rouge pour un membre hors ligne", async () => {
    setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    expect(await screen.findByText("@alice")).toBeInTheDocument();
    const row = screen.getByText("@alice").closest("div")!;
    const dot = row.querySelector("span.bg-red-500");
    expect(dot).not.toBeNull();
  });

  it("affiche une pastille verte pour un membre en ligne", async () => {
    mockGetUserPresence.mockImplementation((userId) => (userId === "u1" ? "online" : "offline"));
    setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@alice");
    const row = screen.getByText("@alice").closest("div")!;
    expect(row.querySelector('span[class*="#58F4A8"]')).not.toBeNull();

    const bobRow = screen.getByText("@bob").closest("div")!;
    expect(bobRow.querySelector("span.bg-red-500")).not.toBeNull();
  });

  it("appelle getUserPresence avec l'id de chaque membre", async () => {
    setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@alice");
    expect(mockGetUserPresence).toHaveBeenCalledWith("u1");
    expect(mockGetUserPresence).toHaveBeenCalledWith("u2");
  });
});
