import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { buildMembership, type WorldRoleRow } from "@/lib/worldPermissions";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
// Le dialogue de confirmation est mocké : Radix + jsdom bouclent sur le
// focus quand un AlertDialog s'ouvre depuis un menu (cf. mémoire du dépôt).
vi.mock("@/components/ui/delete-confirm-dialog", () => ({
  DeleteConfirmDialog: ({ open, onConfirm }: { open?: boolean; onConfirm: () => void }) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        confirmer-retrait
      </button>
    ) : null,
}));

import { MemberManageMenu } from "@/components/worlds/members/MemberManageMenu";

function role(over: Partial<WorldRoleRow> & { id: string; position: number }): WorldRoleRow {
  return {
    world_id: "w1", name: over.id, color: "#000000", lucide_icon: null, permissions: [],
    is_default: false, mentionable: false, hoist: false, ...over,
  };
}
const ADMIN = role({ id: "admin", name: "Administrateur", position: 30, permissions: ["administrator"] });
const EDITOR = role({ id: "editor", name: "Éditeur", position: 20 });
const PLAYER = role({ id: "player", name: "Joueur", position: 10 });
const ROLES = [ADMIN, EDITOR, PLAYER];

const manager = buildMembership({ userId: "me", ownerId: "owner", isMember: true, roles: ROLES, myRoleIds: ["admin"] });
const bob = { user_id: "bob", username: "bob" };

beforeEach(() => vi.clearAllMocks());

function renderMenu(over: Partial<React.ComponentProps<typeof MemberManageMenu>> = {}) {
  const props = {
    worldId: "w1",
    member: bob,
    memberRoles: [PLAYER],
    membership: manager,
    allRoles: ROLES,
    onRolesChanged: vi.fn(),
    onRemoved: vi.fn(),
    ...over,
  };
  render(<MemberManageMenu {...props} />);
  return props;
}

describe("MemberManageMenu", () => {
  it("n'apparaît pas quand le lecteur ne peut pas gérer ce membre", () => {
    const viewer = buildMembership({ userId: "me", ownerId: "owner", isMember: true, roles: ROLES, myRoleIds: ["player"] });
    renderMenu({ membership: viewer });
    expect(screen.queryByRole("button", { name: /Gérer @bob/ })).toBeNull();
  });

  it("ni face à un membre de rang égal ou supérieur", () => {
    renderMenu({ memberRoles: [ADMIN] });
    expect(screen.queryByRole("button", { name: /Gérer @bob/ })).toBeNull();
  });

  it("coche un rôle : une ligne `world_member_roles` est insérée, le parent est prévenu", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByRole("button", { name: /Gérer @bob/ }));
    const editorItem = await screen.findByRole("menuitemcheckbox", { name: /Éditeur/ });
    expect(editorItem).toHaveAttribute("aria-checked", "false");
    await user.click(editorItem);

    expect(mock.client.from).toHaveBeenCalledWith("world_member_roles");
    const builder = mock.builders[0].builder;
    expect(builder.insert).toHaveBeenCalledWith({ world_id: "w1", user_id: "bob", role_id: "editor" });
    expect(props.onRolesChanged).toHaveBeenCalledWith("bob", ["player", "editor"]);
  });

  it("décoche un rôle : la ligne est supprimée", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByRole("button", { name: /Gérer @bob/ }));
    const playerItem = await screen.findByRole("menuitemcheckbox", { name: /Joueur/ });
    expect(playerItem).toHaveAttribute("aria-checked", "true");
    await user.click(playerItem);

    const builder = mock.builders[0].builder;
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("role_id", "player");
    expect(props.onRolesChanged).toHaveBeenCalledWith("bob", []);
  });

  it("un rôle au niveau du gestionnaire est grisé : la base le refuserait", async () => {
    const mock = createSupabaseMock();
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /Gérer @bob/ }));
    const adminItem = await screen.findByRole("menuitemcheckbox", { name: /Administrateur/ });
    expect(adminItem).toHaveAttribute("aria-disabled", "true");
  });

  it("garde le rôle coché et signale l'échec si la base refuse", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: { message: "RLS" } }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByRole("button", { name: /Gérer @bob/ }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /Éditeur/ }));
    expect(props.onRolesChanged).not.toHaveBeenCalled();
  });

  it("retire le membre après confirmation", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    const props = renderMenu();

    await user.click(screen.getByRole("button", { name: /Gérer @bob/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Retirer du monde/ }));
    await user.click(await screen.findByRole("button", { name: "confirmer-retrait" }));

    expect(mock.client.from).toHaveBeenCalledWith("world_members");
    const builder = mock.builders[0].builder;
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("user_id", "bob");
    expect(props.onRemoved).toHaveBeenCalledWith("bob");
  });
});
