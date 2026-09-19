import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const mockGetUserPresence = vi.fn<(userId?: string | null) => "online" | "away" | "offline">(
  () => "offline",
);
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: mockGetUserPresence, onlineUsers: {} }),
}));

// Les rôles du monde viennent du provider d'appartenance (migration 176).
const PLAYER_ROLE = {
  id: "r-player", world_id: "w1", name: "Joueur", color: "#22c55e", lucide_icon: null,
  position: 10, permissions: ["messages.post"], is_default: true, mentionable: false, hoist: true,
};
const SCRIBE_ROLE = { ...PLAYER_ROLE, id: "r-scribe", name: "Scribe", color: "#3b82f6", position: 5, hoist: false };
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({
    worldId: "w1",
    ownerId: "u1",
    roles: [PLAYER_ROLE, SCRIBE_ROLE],
    membership: null,
    can: () => false,
    refresh: () => {},
  }),
}));

import { WorldMembersPanel } from "@/components/worlds/members/WorldMembersPanel";

const PERSONAS_ALICE = [
  { user_id: "u1", persona_id: "p1", name: "Aeris", avatar_url: null },
  { user_id: "u1", persona_id: "p2", name: "Zorg", avatar_url: null },
];

function setup(
  personaRows: unknown[] = [],
  memberRoles: { user_id: string; role_id: string }[] = [{ user_id: "u2", role_id: "r-player" }],
  memberRows: Record<string, unknown>[] = [{ user_id: "u1" }, { user_id: "u2" }],
) {
  // Ordre des `.from()` : world_members, world_member_roles, profiles (cf. lib/worldMembers.ts).
  const mock = createSupabaseMock({
    results: [
      { data: memberRows },
      { data: memberRoles },
      { data: [{ id: "u1", username: "alice", avatar_url: null }, { id: "u2", username: "bob", avatar_url: null }, { id: "u3", username: "carl", avatar_url: null }] },
    ],
  });
  mock.client.rpc.mockResolvedValue({ data: personaRows, error: null });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

/** La carte d'un membre : l'<article> qui entoure son nom affiché. */
function cardOf(name: string) {
  return screen.getByText(name).closest("article")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserPresence.mockReturnValue("offline");
});

describe("WorldMembersPanel — cartes et présence", () => {
  it("affiche une pastille grise et « Hors ligne » pour un membre hors ligne", async () => {
    setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    expect(await screen.findByText("@alice")).toBeInTheDocument();
    const card = cardOf("@alice");
    expect(card.dataset.presence).toBe("offline");
    // Une seule pastille, à côté du statut (aucune sur l’avatar).
    expect(card.querySelectorAll('span[class*="bg-muted-foreground/40"]')).toHaveLength(1);
    expect(card.querySelector("span.bg-red-500")).toBeNull();
    expect(card).toHaveTextContent("Hors ligne");
  });

  it("affiche une pastille verte et « En ligne » pour un membre en ligne", async () => {
    mockGetUserPresence.mockImplementation((userId) => (userId === "u1" ? "online" : "offline"));
    setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@alice");
    const alice = cardOf("@alice");
    expect(alice.dataset.presence).toBe("online");
    expect(alice.querySelectorAll('span[class*="#58F4A8"]')).toHaveLength(1);
    expect(alice).toHaveTextContent("En ligne");

    const bob = cardOf("@bob");
    expect(bob.dataset.presence).toBe("offline");
    expect(bob.querySelector('span[class*="bg-muted-foreground/40"]')).not.toBeNull();
  });

  it("appelle getUserPresence avec l'id de chaque membre", async () => {
    setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@alice");
    expect(mockGetUserPresence).toHaveBeenCalledWith("u1");
    expect(mockGetUserPresence).toHaveBeenCalledWith("u2");
  });
});

describe("WorldMembersPanel — rôles et personas", () => {
  it("le propriétaire a sa section ; un rôle « hoist » donne la sienne, et ses puces sur la carte", async () => {
    setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@alice");
    expect(screen.getByRole("heading", { name: /Propriétaire/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Joueur/ })).toBeInTheDocument();
    expect(cardOf("@alice")).not.toHaveTextContent("Propriétaire");
    // Le rôle figure sur la carte en puce : un membre peut en cumuler plusieurs.
    expect(cardOf("@bob")).toHaveTextContent("Joueur");
  });

  it("un membre dont aucun rôle n'est « hoist » va dans la section « Membres », ses rôles en puces", async () => {
    setup([], [{ user_id: "u2", role_id: "r-scribe" }]);
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@bob");
    expect(screen.getByRole("heading", { name: /Membres/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Scribe/ })).toBeNull();
    expect(cardOf("@bob")).toHaveTextContent("Scribe");
  });

  it("sans droit de gestion, aucune carte ne porte de menu « ⋯ »", async () => {
    setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByText("@bob");
    expect(screen.queryByRole("button", { name: /Gérer/ })).toBeNull();
  });

  it("liste les personas joués en puces, et un texte quand il n'y en a pas", async () => {
    setup(PERSONAS_ALICE);
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@alice");
    const alice = cardOf("@alice");
    expect(alice).toHaveTextContent("Aeris");
    expect(alice).toHaveTextContent("Zorg");
    expect(alice).not.toHaveTextContent("Aucun persona dans ce monde");
    expect(cardOf("@bob")).toHaveTextContent("Aucun persona dans ce monde");
  });
});

describe("WorldMembersPanel — filtre « en ligne »", () => {
  it("ne garde que les membres en ligne, puis les rétablit au second clic", async () => {
    mockGetUserPresence.mockImplementation((userId) => (userId === "u1" ? "online" : "offline"));
    setup();
    const user = userEvent.setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@bob");
    const toggle = screen.getByRole("button", { pressed: false, name: /en ligne/i });
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.queryByText("@bob")).toBeNull();

    await user.click(toggle);
    expect(screen.getByText("@bob")).toBeInTheDocument();
  });

  it("se combine avec la recherche", async () => {
    mockGetUserPresence.mockImplementation((userId) => (userId === "u1" ? "online" : "offline"));
    setup();
    const user = userEvent.setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@bob");
    await user.click(screen.getByRole("button", { pressed: false, name: /en ligne/i }));
    await user.type(screen.getByRole("searchbox"), "bob");

    expect(screen.getByText("Aucun membre ne correspond.")).toBeInTheDocument();
  });
});

describe("WorldMembersPanel — recherche", () => {
  it("filtre par nom de membre, sans casse ni accents", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@alice");
    await user.type(screen.getByRole("searchbox"), "ALÍ");

    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.queryByText("@bob")).toBeNull();
  });

  it("retrouve un membre par le nom d'un de ses personas", async () => {
    setup(PERSONAS_ALICE);
    const user = userEvent.setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@alice");
    await user.type(screen.getByRole("searchbox"), "zorg");

    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.queryByText("@bob")).toBeNull();
  });

  it("annonce l'absence de résultat", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@alice");
    await user.type(screen.getByRole("searchbox"), "xyz");

    expect(screen.getByText("Aucun membre ne correspond.")).toBeInTheDocument();
  });
});

describe("WorldMembersPanel — statut et carte", () => {
  it("un membre en pause passe en fin de section, badge à l'appui", async () => {
    mockGetUserPresence.mockReturnValue("offline");
    setup(
      [],
      [{ user_id: "u2", role_id: "r-player" }, { user_id: "u3", role_id: "r-player" }],
      [{ user_id: "u1" }, { user_id: "u2", status: "paused", status_until: "2026-12-31" }, { user_id: "u3" }],
    );
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@bob");
    const names = screen.getAllByRole("article").map((a) => a.querySelector("p.font-semibold")?.textContent);
    // Alice (propriétaire) dans sa section ; Carl avant Bob, en pause.
    expect(names).toEqual(["@alice", "@carl", "@bob"]);
    expect(cardOf("@bob")).toHaveTextContent(/En pause jusqu'au 31 déc/);
  });

  it("sans appartenance connue, pas de bouton « Ma carte »", async () => {
    setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByText("@bob");
    expect(screen.queryByRole("button", { name: /Ma carte/ })).toBeNull();
  });
});
