import { describe, it, expect, vi, beforeEach } from "vitest";

const inviteUserByEmail = vi.fn();
const adminInsert = vi.fn();
const adminFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { inviteUserByEmail } },
    from: adminFrom,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { inviteUserToWorld } from "@/app/actions/invite";
import { createClient } from "@/lib/supabase/server";

/** Client utilisateur : claims JWT + lecture de sa propre adhésion. */
function mockCaller(sub: string | null, callerRole: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: sub ? { claims: { sub } } : null }),
    },
    from: () => {
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) builder[m] = () => builder;
      builder.maybeSingle = () =>
        Promise.resolve({ data: callerRole ? { role: callerRole } : null, error: null });
      return builder;
    },
  } as never);
}

/** Client service_role : `world_invitations`, `notifications`, lectures. */
function mockAdminTables() {
  adminFrom.mockImplementation((table: string) => {
    if (table === "world_invitations" || table === "notifications") {
      return { insert: (row: unknown) => adminInsert(table, row) ?? Promise.resolve({ error: null }) };
    }
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) builder[m] = () => builder;
    builder.maybeSingle = () => Promise.resolve({ data: { name: "Monde", username: "alice" }, error: null });
    return builder;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  adminInsert.mockReturnValue(Promise.resolve({ error: null }));
  mockAdminTables();
  inviteUserByEmail.mockResolvedValue({ data: { user: { id: "invitee-1" } }, error: null });
});

describe("inviteUserToWorld", () => {
  it("refuse un appelant non authentifié", async () => {
    mockCaller(null, null);
    const res = await inviteUserToWorld("a@b.com", "w1", "player");
    expect(res.error).toBe("unauthenticated");
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  // Le cœur du correctif. Cette action est la seule à passer par le
  // service_role, qui contourne la RLS : sans contrôle explicite, n'importe
  // quel compte connecté pouvait faire envoyer un courriel d'invitation signé
  // du projet, vers une adresse arbitraire, pour un monde dont il n'est pas
  // membre — et s'y attribuer le rôle « admin ».
  it("refuse un appelant qui n'est membre d'aucun monde", async () => {
    mockCaller("u1", null);
    const res = await inviteUserToWorld("a@b.com", "w1", "admin");
    expect(res.error).toBe("forbidden");
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it.each(["player", "editor", "viewer"])(
    "refuse un membre simple (%s) du monde",
    async (role) => {
      mockCaller("u1", role);
      const res = await inviteUserToWorld("a@b.com", "w1", "admin");
      expect(res.error).toBe("forbidden");
      expect(inviteUserByEmail).not.toHaveBeenCalled();
    },
  );

  it.each(["owner", "admin"])("laisse passer un %s du monde", async (role) => {
    mockCaller("u1", role);
    const res = await inviteUserToWorld("a@b.com", "w1", "editor");
    expect(res).toEqual({});
    expect(inviteUserByEmail).toHaveBeenCalledWith("a@b.com");
  });

  // Le rôle ne doit plus voyager dans `user_metadata` : Supabase laisse
  // l'utilisateur réécrire ses propres métadonnées, elles ne peuvent donc
  // porter aucune décision d'autorisation.
  it("n'envoie aucune métadonnée de rôle ou de monde avec le courriel", async () => {
    mockCaller("u1", "admin");
    await inviteUserToWorld("a@b.com", "w1", "admin");
    const args = inviteUserByEmail.mock.calls[0];
    expect(JSON.stringify(args)).not.toMatch(/invited_role|invited_world_id/);
  });

  it("enregistre l'invitation en base avec le rôle demandé", async () => {
    mockCaller("u1", "owner");
    await inviteUserToWorld("a@b.com", "w1", "editor");
    expect(adminInsert).toHaveBeenCalledWith("world_invitations", {
      world_id: "w1",
      invitee_id: "invitee-1",
      inviter_id: "u1",
      role: "editor",
    });
  });

  it("notifie l'invité pour que l'invitation soit visible à sa connexion", async () => {
    mockCaller("u1", "admin");
    await inviteUserToWorld("a@b.com", "w1", "player");
    const notif = adminInsert.mock.calls.find(([table]) => table === "notifications");
    expect(notif?.[1]).toMatchObject({
      recipient_id: "invitee-1",
      type: "world_invite",
      world_id: "w1",
      actor_id: "u1",
    });
  });

  it("remonte le message d'erreur de l'envoi", async () => {
    mockCaller("u1", "admin");
    inviteUserByEmail.mockResolvedValue({ data: null, error: { message: "déjà invité" } });
    const res = await inviteUserToWorld("a@b.com", "w1", "player");
    expect(res.error).toBe("déjà invité");
  });

  it("n'enregistre rien si le compte invité n'a pas pu être créé", async () => {
    mockCaller("u1", "admin");
    inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: null });
    const res = await inviteUserToWorld("a@b.com", "w1", "player");
    expect(res.error).toBe("saveFailed");
    expect(adminInsert).not.toHaveBeenCalled();
  });
});
