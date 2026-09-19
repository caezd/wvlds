import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { buildMembership, type WorldRoleRow } from "@/lib/worldPermissions";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/app/actions/invite", () => ({ inviteUserToWorld: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "me", username: "moi" }),
}));

function role(over: Partial<WorldRoleRow> & { id: string; position: number }): WorldRoleRow {
  return {
    world_id: "w1", name: over.id, color: "#000000", lucide_icon: null, permissions: [],
    is_default: false, mentionable: false, hoist: false, ...over,
  };
}
const ADMIN = role({ id: "admin", name: "Administrateur", position: 30, permissions: ["administrator"] });
const EDITOR = role({ id: "editor", name: "Éditeur", position: 20, permissions: ["wiki.edit"] });
const PLAYER = role({ id: "player", name: "Joueur", position: 10, permissions: ["messages.post"], is_default: true });
const ROLES = [ADMIN, EDITOR, PLAYER];

let membershipForTest = buildMembership({ userId: "me", ownerId: "owner", isMember: true, roles: ROLES, myRoleIds: ["admin"] });
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({
    worldId: "w1",
    ownerId: "owner",
    roles: ROLES,
    membership: membershipForTest,
    can: () => true,
    refresh: () => {},
  }),
}));

import { WorldInviteDialog } from "@/components/worlds/members/WorldInviteDialog";

beforeEach(() => {
  vi.clearAllMocks();
  membershipForTest = buildMembership({ userId: "me", ownerId: "owner", isMember: true, roles: ROLES, myRoleIds: ["admin"] });
});

describe("WorldInviteDialog", () => {
  it("prévisualise les rôles par défaut et leurs permissions", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    render(<WorldInviteDialog worldId="w1" />);

    await user.click(screen.getByRole("button", { name: "Inviter" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Joueur");
    // « Écrire dans les salons » est accordé, « Modifier le wiki » barré.
    expect(dialog).toHaveTextContent("Écrire dans les salons");
    expect(dialog).toHaveTextContent("Modifier le wiki");
  });

  it("invite un compte existant avec les rôles par défaut (`role_id` nul) et le notifie", async () => {
    const mock = createSupabaseMock({
      // world_invitations (en attente) → worlds → delete invitation → insert invitation → notifications
      results: [
        { data: [] },
        { data: { name: "Monde", icon_url: null, banner_url: null, description: null } },
        { data: null },
        { data: null },
        { data: null },
      ],
    });
    mock.client.rpc.mockResolvedValue({ data: [{ user_id: "bob", email: "bob@x.io", username: "bob" }], error: null });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    render(<WorldInviteDialog worldId="w1" />);

    await user.click(screen.getByRole("button", { name: "Inviter" }));
    await user.type(await screen.findByLabelText("Courriel"), "bob@x.io");
    await user.click(screen.getByRole("button", { name: "Inviter", hidden: false }));

    await waitFor(() => {
      const inv = mock.builders.find((b) => b.table === "world_invitations" && b.builder.insert.mock.calls.length > 0);
      expect(inv?.builder.insert).toHaveBeenCalledWith({
        world_id: "w1",
        invitee_id: "bob",
        inviter_id: "me",
        role_id: null,
      });
    });
    const notif = mock.builders.find((b) => b.table === "notifications");
    expect(notif?.builder.insert).toHaveBeenCalledWith(expect.objectContaining({ recipient_id: "bob", type: "world_invite" }));
  });

  it("un éditeur ne se voit proposer aucun rôle qu'il ne pourrait pas conférer", async () => {
    membershipForTest = buildMembership({ userId: "me", ownerId: "owner", isMember: true, roles: ROLES, myRoleIds: ["editor"] });
    const mock = createSupabaseMock({ results: [{ data: [] }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    render(<WorldInviteDialog worldId="w1" />);

    await user.click(screen.getByRole("button", { name: "Inviter" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("combobox", { name: "Rôle" }));

    const options = await screen.findAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).toEqual(expect.arrayContaining(["Rôles par défaut"]));
    expect(labels.some((l) => l?.includes("Administrateur"))).toBe(false);
    expect(labels.some((l) => l?.includes("Éditeur"))).toBe(false);
  });
});
