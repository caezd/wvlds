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

import { WorldMembersPanel } from "@/components/worlds/members/WorldMembersPanel";

const PERSONAS_ALICE = [
  { user_id: "u1", persona_id: "p1", name: "Aeris", avatar_url: null },
  { user_id: "u1", persona_id: "p2", name: "Zorg", avatar_url: null },
];

function setup(personaRows: unknown[] = []) {
  const mock = createSupabaseMock({
    results: [
      { data: { owner_id: "u1" } },
      { data: [{ user_id: "u1", role: "owner" }, { user_id: "u2", role: "player" }] },
      { data: [{ id: "u1", username: "alice", avatar_url: null }, { id: "u2", username: "bob", avatar_url: null }] },
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
  it("regroupe par rôle : le rôle est le titre de la section, pas répété sur la carte", async () => {
    setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);

    await screen.findByText("@alice");
    expect(screen.getByRole("heading", { name: /Propriétaire/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Joueur/ })).toBeInTheDocument();
    expect(cardOf("@alice")).not.toHaveTextContent("Propriétaire");
    expect(cardOf("@bob")).not.toHaveTextContent("Joueur");
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
