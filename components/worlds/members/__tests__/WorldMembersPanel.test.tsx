import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

// jsdom fournit un localStorage partiel (pas de .clear()) — remplacé par une
// implémentation complète, comme lib/__tests__/searchHistory.test.ts.
const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
});

const presence = vi.hoisted(() => ({ of: (() => "offline") as (id?: string | null) => "online" | "away" | "offline" }));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: (id?: string | null) => presence.of(id), onlineUsers: {} }),
}));
vi.mock("@/components/ui/LazyLucideIcon", () => ({
  LazyLucideIcon: ({ name }: { name: string }) => <span data-testid={`icone-${name}`} />,
}));
const PLAYER_ROLE = {
  id: "r-player", world_id: "w1", name: "Joueur", color: "#22c55e", lucide_icon: null,
  position: 10, permissions: ["messages.post"], is_default: true, mentionable: false, hoist: true,
};
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({ worldId: "w1", ownerId: "u1", roles: [PLAYER_ROLE], membership: null, can: () => false, refresh: () => {} }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: "u2", username: "bob", avatarUrl: null }) }));
const dms = vi.hoisted(() => ({ openConversation: vi.fn(async (_id: string) => {}) }));
vi.mock("@/components/providers/DmsProvider", () => ({ useDms: () => dms }));
vi.mock("@/hooks/useWorldReviewActive", () => ({ useWorldReviewActive: () => true }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/personas/PersonaCreateSheet", () => ({
  PersonaCreateSheet: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));
// Les tiroirs ne sont pas l'objet du test : le déclencheur suffit.
vi.mock("@/components/personas/PersonaProfileSheetTrigger", () => ({
  PersonaProfileSheetTrigger: ({ children, label, triggerClassName }: { children: React.ReactNode; label: string; triggerClassName?: string }) => (
    <button type="button" aria-label={label} className={triggerClassName}>{children}</button>
  ),
}));
vi.mock("@/components/profile/UserProfileSheetTrigger", () => ({
  UserProfileSheetTrigger: ({ children, label }: { children: React.ReactNode; label?: string }) => (
    <button type="button" aria-label={label ?? undefined}>{children}</button>
  ),
}));

import { WorldMembersPanel } from "@/components/worlds/members/WorldMembersPanel";
import { notifyPersonasChanged } from "@/hooks/usePersonasChanged";

/** Un faux client qui répond par table (et par RPC), quel que soit l'ordre des appels. */
function fakeClient(tables: Record<string, unknown[]>, rpcs: Record<string, unknown> = {}) {
  const builder = (data: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "order", "neq", "limit"]) b[m] = () => b;
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
    return b;
  };
  return {
    from: (table: string) => builder(tables[table] ?? []),
    rpc: vi.fn(async (name: string) => ({ data: rpcs[name] ?? null, error: null })),
  };
}

const PROFILES = [
  { id: "u1", username: "alice", avatar_url: null },
  { id: "u2", username: "bob", avatar_url: null },
  { id: "u3", username: "carl", avatar_url: null },
  { id: "u4", username: "dora", avatar_url: null },
];
const persona = (id: string, name: string, user_id: string, extra: Record<string, unknown> = {}) => ({
  id, name, user_id, avatar_url: null, created_at: "2026-01-01", narrative_status: "alive", review_status: "approved", sheet_complete: true, is_npc: false, ...extra,
});

function setup({
  members = [{ user_id: "u1" }, { user_id: "u2" }, { user_id: "u3" }] as Record<string, unknown>[],
  roles = [{ user_id: "u3", role_id: "r-player" }],
  personas = [persona("p1", "Aeris", "u1"), persona("p2", "Zorg", "u1", { narrative_status: "dead" })] as unknown[],
  groups = [] as unknown[],
} = {}) {
  const tables: Record<string, unknown[]> = {
    world_members: members,
    world_member_roles: roles,
    profiles: PROFILES,
    personas,
    world_persona_groups: groups,
    persona_group_assignments: [],
  };
  vi.mocked(createClient).mockReturnValue(fakeClient(tables) as never);
  // Les tables restent modifiables : le client, lui, est créé une fois par le composant.
  return tables;
}

/** L'étagère d'un membre : l'<article> que titre son pseudo. */
function bandOf(name: string) {
  return screen.getByRole("heading", { name }).closest("article")!;
}
function bandNames() {
  return screen.getAllByRole("article").map((a) => a.querySelector("h3")?.textContent);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  presence.of = () => "offline";
});

describe("WorldMembersPanel — vue Joueurs", () => {
  it("tous les personas d'un joueur en grille : douze tuiles, aucun défilement horizontal", async () => {
    setup({ personas: Array.from({ length: 12 }, (_, i) => persona(`p${i}`, `Perso ${String(i).padStart(2, "0")}`, "u1")) });
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByRole("heading", { name: "@alice" });

    const alice = bandOf("@alice");
    expect(within(alice).getAllByRole("button", { name: /^Perso / })).toHaveLength(12);
    expect(alice.querySelector("[class*='overflow-x']")).toBeNull();
  });

  it("moi d'abord, puis le propriétaire, puis les rôles « hoist »", async () => {
    setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByRole("heading", { name: "@alice" });
    expect(bandNames()).toEqual(["Moi · @bob", "@alice", "@carl"]);
    expect(within(bandOf("@alice")).getByRole("list", { name: "Rôles" })).toHaveTextContent("Propriétaire");
  });

  it("chaque bande dit la présence du membre et montre ses personas en tuiles", async () => {
    presence.of = (id) => (id === "u1" ? "online" : "offline");
    setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByRole("heading", { name: "@alice" });

    const alice = bandOf("@alice");
    expect(alice.querySelector("[data-presence='online']")).not.toBeNull();
    expect(alice).toHaveTextContent("En ligne");
    expect(within(alice).getByRole("button", { name: "Aeris" })).toBeInTheDocument();
    expect(within(alice).getByRole("button", { name: "Zorg" }).querySelector("[data-narrative-status='dead']")).not.toBeNull();
    expect(bandOf("@carl")).toHaveTextContent("Aucun persona dans ce monde");
  });

  it("mon étagère porte « Nouveau persona », sans action (ma carte vit dans « Mon profil ») ; les autres, « Profil » et « Écrire »", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByRole("heading", { name: "@alice" });

    const mine = bandOf("Moi · @bob");
    expect(within(mine).getByRole("button", { name: "Nouveau persona" })).toBeInTheDocument();
    expect(within(mine).queryByRole("button", { name: /Ma carte/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ma carte/ })).toBeNull();
    expect(within(mine).queryByRole("button", { name: "Écrire" })).toBeNull();

    await user.click(within(bandOf("@alice")).getByRole("button", { name: "Écrire" }));
    expect(dms.openConversation).toHaveBeenCalledWith("u1");
    expect(screen.queryByRole("button", { name: /Gérer/ })).toBeNull();
  });

  it("un membre en pause passe en fin de son groupe, badge à l'appui", async () => {
    setup({
      members: [{ user_id: "u1" }, { user_id: "u2" }, { user_id: "u3", status: "paused", status_until: "2099-12-31" }, { user_id: "u4" }],
      roles: [{ user_id: "u3", role_id: "r-player" }, { user_id: "u4", role_id: "r-player" }],
    });
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByRole("heading", { name: "@carl" });
    expect(bandNames()).toEqual(["Moi · @bob", "@alice", "@dora", "@carl"]);
    expect(bandOf("@carl")).toHaveTextContent(/En pause jusqu'au 31 déc/);
  });

  it("la bande des PNJ vient en dernier", async () => {
    setup({ personas: [persona("n1", "Aubergiste", "u1", { is_npc: true })] });
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByRole("heading", { name: "@alice" });
    expect(bandNames().at(-1)).toBe("PNJ du monde");
    expect(within(screen.getAllByRole("article").at(-1)!).getByRole("button", { name: "Aubergiste" })).toBeInTheDocument();
  });
});

describe("WorldMembersPanel — filtres et recherche", () => {
  it("la carte « Joueurs en ligne » ne garde que les membres en ligne, puis les rétablit", async () => {
    presence.of = (id) => (id === "u1" ? "online" : "offline");
    setup();
    const user = userEvent.setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByRole("heading", { name: "@alice" });

    const card = screen.getByRole("button", { name: /Joueurs en ligne/ });
    expect(card).toHaveTextContent("1");
    await user.click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(bandNames()).toEqual(["@alice"]);
    await user.click(card);
    expect(bandNames()).toEqual(["Moi · @bob", "@alice", "@carl"]);
  });

  it("la recherche d'un persona garde son joueur avec ce seul persona, et « Voir tout » rend les autres", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByRole("heading", { name: "@alice" });

    await user.type(screen.getByRole("searchbox"), "zorg");
    expect(bandNames()).toEqual(["@alice"]);
    const alice = bandOf("@alice");
    expect(within(alice).queryByRole("button", { name: "Aeris" })).toBeNull();
    await user.click(within(alice).getByRole("button", { name: "Voir tous ses personas (+1)" }));
    expect(within(bandOf("@alice")).getByRole("button", { name: "Aeris" })).toBeInTheDocument();
  });

  it("filtre par pseudo, sans casse ni accents, et annonce l'absence de résultat", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByRole("heading", { name: "@alice" });

    await user.type(screen.getByRole("searchbox"), "CÁRL");
    expect(bandNames()).toEqual(["@carl"]);
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "xyz");
    expect(screen.getByText("Aucun membre ne correspond.")).toBeInTheDocument();
  });
});

describe("WorldMembersPanel — vues des personas", () => {
  it("« Groupes » range les personas en murs, et s'en souvient pour ce monde", async () => {
    setup({ groups: [{ id: "g1", name: "Garde", color: "#ff0000" }] });
    const user = userEvent.setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByRole("heading", { name: "@alice" });

    await user.click(screen.getByRole("radio", { name: "Groupes" }));
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Sans groupe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aeris" })).toHaveTextContent("@alice");
    expect(localStorage.getItem("community.view.w1")).toBe("groups");
  });

  it("« Liste » : une grille, des lettres et leur index", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByRole("heading", { name: "@alice" });

    await user.click(screen.getByRole("radio", { name: "Liste" }));
    const index = screen.getByRole("navigation", { name: "Index alphabétique" });
    expect(within(index).getAllByRole("button").map((b) => b.textContent)).toEqual(["A", "Z"]);
  });
});

describe("WorldMembersPanel — un persona supprimé depuis son tiroir", () => {
  it("disparaît de la liste : le signal des tiroirs recharge les personas", async () => {
    const tables = setup();
    render(<WorldMembersPanel worldId="w1" ownerId="u1" canManage={false} isShared />);
    await screen.findByRole("heading", { name: "@alice" });
    expect(within(bandOf("@alice")).getByRole("button", { name: "Aeris" })).toBeInTheDocument();

    // Le tiroir a supprimé Aeris : la base ne le rend plus, puis le signal part.
    tables.personas = [persona("p2", "Zorg", "u1", { narrative_status: "dead" })];
    act(() => notifyPersonasChanged());

    await waitFor(() => expect(within(bandOf("@alice")).queryByRole("button", { name: "Aeris" })).toBeNull());
    expect(within(bandOf("@alice")).getByRole("button", { name: "Zorg" })).toBeInTheDocument();
  });
});
