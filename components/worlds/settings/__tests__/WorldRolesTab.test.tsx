import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { buildMembership, type WorldRoleRow } from "@/lib/worldPermissions";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/components/ui/LucideIconPicker", () => ({
  LucideIconPicker: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

const refresh = vi.fn();
let membershipForTest: ReturnType<typeof buildMembership> = null;
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({
    worldId: "w1",
    ownerId: "owner",
    roles: [],
    membership: membershipForTest,
    can: () => true,
    refresh,
  }),
}));

import { WorldRolesTab } from "@/components/worlds/settings/WorldRolesTab";

function role(over: Partial<WorldRoleRow> & { id: string; position: number }): WorldRoleRow {
  return {
    world_id: "w1", name: over.id, color: "#000000", lucide_icon: null, permissions: [],
    is_default: false, mentionable: false, hoist: false, ...over,
  };
}
const ADMIN = role({ id: "admin", name: "Administrateur", position: 30, permissions: ["administrator"] });
const EDITOR = role({ id: "editor", name: "Éditeur", position: 20, permissions: ["wiki.edit", "map.edit", "roles.manage"] });
const PLAYER = role({ id: "player", name: "Joueur", position: 10, permissions: ["messages.post"], is_default: true });
const ROLES = [PLAYER, ADMIN, EDITOR];

function asOwner() {
  membershipForTest = buildMembership({ userId: "owner", ownerId: "owner", isMember: true, roles: ROLES, myRoleIds: [] });
}
function asEditor() {
  membershipForTest = buildMembership({ userId: "me", ownerId: "owner", isMember: true, roles: ROLES, myRoleIds: ["editor"] });
}

/** Ordre des `.from()` : world_roles (liste), world_member_roles (compteurs), puis les écritures. */
function setup(extra: { data?: unknown; error?: unknown }[] = []) {
  const mock = createSupabaseMock({
    results: [
      { data: ROLES },
      { data: [{ role_id: "player" }, { role_id: "player" }, { role_id: "admin" }] },
      ...extra,
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

/** Deux colonnes : `useMediaQuery(MEDIA.md)` vrai. jsdom rend « petit écran » par défaut. */
function grandEcran() {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: query.includes("48rem"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList));
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  asOwner();
});

describe("WorldRolesTab — liste", () => {
  it("liste les rôles du plus haut au plus bas, avec le nombre de porteurs", async () => {
    setup();
    render(<WorldRolesTab worldId="w1" />);
    const list = await screen.findByRole("list", { name: "Rôles" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Administrateur"),
      expect.stringContaining("Éditeur"),
      expect.stringContaining("Joueur"),
    ]);
    expect(items[0]).toHaveTextContent("1");
    expect(items[2]).toHaveTextContent("2");
  });

  it("sélectionne le plus haut rôle par défaut et montre sa fiche", async () => {
    setup();
    render(<WorldRolesTab worldId="w1" />);
    const section = await screen.findByRole("region", { name: "Administrateur" });
    expect(within(section).getByLabelText("Nom")).toHaveValue("Administrateur");
  });

  it("sous md, la fiche se déplie dans la ligne du rôle et le clic la referme", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldRolesTab worldId="w1" />);

    // Le premier rôle est ouvert d'emblée, sa fiche est DANS sa ligne.
    const ligne = (await screen.findByRole("button", { name: /^Administrateur/ })).closest("li")!;
    const entete = within(ligne).getByRole("button", { name: /^Administrateur/ });
    expect(entete).toHaveAttribute("aria-expanded", "true");
    expect(within(ligne).getByRole("region", { name: "Administrateur" })).toBeInTheDocument();

    // Un autre rôle prend sa place ; le premier se referme.
    await user.click(screen.getByRole("button", { name: /^Joueur/ }));
    expect(within(ligne).queryByRole("region", { name: "Administrateur" })).toBeNull();
    expect(screen.getByRole("region", { name: "Joueur" })).toBeInTheDocument();

    // Un second clic sur la même ligne la referme : rien n'est déplié.
    await user.click(screen.getByRole("button", { name: /^Joueur/ }));
    expect(screen.queryByRole("region", { name: "Joueur" })).toBeNull();
  });

  it("au-dessus de md, la fiche vit dans la colonne de droite, hors des lignes", async () => {
    grandEcran();
    setup();
    render(<WorldRolesTab worldId="w1" />);

    const section = await screen.findByRole("region", { name: "Administrateur" });
    expect(section.closest("li")).toBeNull();
    // Pas de dépli : l'en-tête n'annonce rien à ouvrir.
    expect(screen.getByRole("button", { name: /^Administrateur/ })).not.toHaveAttribute("aria-expanded");
  });

  it("crée un rôle sous tous les autres et le sélectionne", async () => {
    const created = role({ id: "new", name: "Nouveau rôle", position: 0 });
    const mock = setup([{ data: created }]);
    const user = userEvent.setup();
    render(<WorldRolesTab worldId="w1" />);
    await screen.findByRole("list", { name: "Rôles" });

    await user.click(screen.getByRole("button", { name: /Nouveau rôle/ }));

    const insert = mock.builders.find((b) => b.builder.insert.mock.calls.length > 0)!;
    expect(insert.table).toBe("world_roles");
    expect(insert.builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ world_id: "w1", name: "Nouveau rôle", position: 0 }),
    );
    expect(await screen.findByRole("region", { name: "Nouveau rôle" })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });
});

describe("WorldRolesTab — fiche", () => {
  it("coche une permission : le tableau complet est réécrit, puis le monde rafraîchi", async () => {
    const mock = setup([{ data: null, error: null }]);
    const user = userEvent.setup();
    render(<WorldRolesTab worldId="w1" />);
    await screen.findByRole("list", { name: "Rôles" });
    await user.click(screen.getByRole("button", { name: /^Éditeur/ }));

    const section = await screen.findByRole("region", { name: "Éditeur" });
    await user.click(within(section).getByRole("checkbox", { name: "Modifier le catalogue" }));

    const update = mock.builders.find((b) => b.builder.update.mock.calls.length > 0)!;
    expect(update.builder.update).toHaveBeenCalledWith({ permissions: ["wiki.edit", "map.edit", "roles.manage", "catalog.edit"] });
    expect(update.builder.eq).toHaveBeenCalledWith("id", "editor");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("`administrator` coche tout et fige les autres cases", async () => {
    setup();
    render(<WorldRolesTab worldId="w1" />);
    const section = await screen.findByRole("region", { name: "Administrateur" });
    const wiki = within(section).getByRole("checkbox", { name: "Modifier le wiki" });
    expect(wiki).toHaveAttribute("aria-checked", "true");
    expect(wiki).toBeDisabled();
  });

  it("renomme à la sortie du champ, pas à chaque frappe", async () => {
    const mock = setup([{ data: null, error: null }]);
    const user = userEvent.setup();
    render(<WorldRolesTab worldId="w1" />);
    const section = await screen.findByRole("region", { name: "Administrateur" });
    const input = within(section).getByLabelText("Nom");

    await user.clear(input);
    await user.type(input, "Gardiens");
    expect(mock.builders.some((b) => b.builder.update.mock.calls.length > 0)).toBe(false);
    await user.tab();

    const update = mock.builders.find((b) => b.builder.update.mock.calls.length > 0)!;
    expect(update.builder.update).toHaveBeenCalledWith({ name: "Gardiens" });
  });

  it("revient à la valeur précédente et signale l'échec quand la base refuse", async () => {
    setup([{ data: null, error: { message: "RLS" } }]);
    const user = userEvent.setup();
    render(<WorldRolesTab worldId="w1" />);
    await screen.findByRole("list", { name: "Rôles" });
    await user.click(screen.getByRole("button", { name: /^Éditeur/ }));
    const section = await screen.findByRole("region", { name: "Éditeur" });

    await user.click(within(section).getByRole("switch", { name: "Mentionnable par tous" }));
    await waitFor(() =>
      expect(within(section).getByRole("switch", { name: "Mentionnable par tous" })).toHaveAttribute("aria-checked", "false"),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("WorldRolesTab — hiérarchie", () => {
  it("un éditeur voit le rôle Administrateur verrouillé et ne peut conférer que ce qu'il a", async () => {
    asEditor();
    setup();
    const user = userEvent.setup();
    render(<WorldRolesTab worldId="w1" />);

    // Sa fiche : verrouillée (rang 30 ≥ 20).
    const admin = await screen.findByRole("region", { name: "Administrateur" });
    expect(within(admin).getByLabelText("Nom")).toBeDisabled();
    expect(within(admin).getByText(/vous pouvez le consulter, pas le modifier/)).toBeInTheDocument();

    // Un rôle sous lui : modifiable, mais pas au-delà de ses propres permissions.
    await user.click(screen.getByRole("button", { name: /^Joueur/ }));
    const player = await screen.findByRole("region", { name: "Joueur" });
    expect(within(player).getByRole("checkbox", { name: "Modifier le wiki" })).toBeEnabled();
    expect(within(player).getByRole("checkbox", { name: "Modifier le catalogue" })).toBeDisabled();
    expect(within(player).getByRole("checkbox", { name: "Administrateur" })).toBeDisabled();
  });

  it("les flèches ne déplacent un rôle qu'entre voisins gérables", async () => {
    asEditor();
    setup();
    render(<WorldRolesTab worldId="w1" />);
    const list = await screen.findByRole("list", { name: "Rôles" });
    const items = within(list).getAllByRole("listitem");
    // Joueur ne peut pas monter au-dessus d'Éditeur (rang du lecteur).
    expect(within(items[2]).getByRole("button", { name: "Déplacer vers le haut" })).toBeDisabled();
    // Éditeur n'est pas gérable par un éditeur.
    expect(within(items[1]).getByRole("button", { name: "Déplacer vers le bas" })).toBeDisabled();
  });

  it("échange les positions de deux voisins gérables", async () => {
    const mock = setup([{ data: null, error: null }, { data: null, error: null }]);
    const user = userEvent.setup();
    render(<WorldRolesTab worldId="w1" />);
    const list = await screen.findByRole("list", { name: "Rôles" });
    const items = within(list).getAllByRole("listitem");

    await user.click(within(items[2]).getByRole("button", { name: "Déplacer vers le haut" }));

    const updates = mock.builders.filter((b) => b.builder.update.mock.calls.length > 0);
    expect(updates.map((b) => b.builder.update.mock.calls[0][0])).toEqual([{ position: 20 }, { position: 10 }]);
    expect(updates[0].builder.eq).toHaveBeenCalledWith("id", "player");
    expect(updates[1].builder.eq).toHaveBeenCalledWith("id", "editor");
  });
});
