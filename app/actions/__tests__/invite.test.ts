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

type Caller = {
  /** `has_world_permission(…, 'members.manage')` tel que la base le rendrait. */
  canManage: boolean;
  /** `world_rank` de l'appelant. */
  rank?: number;
  /** Le rôle visé par l'invitation, tel que lu sous RLS (null : inconnu ou d'un autre monde). */
  role?: { id: string; position: number } | null;
};

/** Client utilisateur : claims JWT, RPC de permission et de rang, lecture du rôle. */
function mockCaller(sub: string | null, caller: Caller = { canManage: false }) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: sub ? { claims: { sub } } : null }),
    },
    rpc: (name: string) => {
      if (name === "has_world_permission") return Promise.resolve({ data: caller.canManage, error: null });
      if (name === "world_rank") return Promise.resolve({ data: caller.rank ?? -1, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from: () => {
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) builder[m] = () => builder;
      builder.maybeSingle = () => Promise.resolve({ data: caller.role ?? null, error: null });
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

const ROLE_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  adminInsert.mockReturnValue(Promise.resolve({ error: null }));
  mockAdminTables();
  inviteUserByEmail.mockResolvedValue({ data: { user: { id: "invitee-1" } }, error: null });
});

describe("inviteUserToWorld", () => {
  it("refuse un appelant non authentifié", async () => {
    mockCaller(null);
    const res = await inviteUserToWorld("a@b.com", "w1", null);
    expect(res.error).toBe("unauthenticated");
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  // Le cœur du correctif. Cette action est la seule à passer par le
  // service_role, qui contourne la RLS : sans contrôle explicite, n'importe
  // quel compte connecté pouvait faire envoyer un courriel d'invitation signé
  // du projet, vers une adresse arbitraire, pour un monde dont il n'est pas
  // membre — et y conférer un rôle de son choix.
  it("refuse un appelant sans `members.manage` dans le monde", async () => {
    mockCaller("u1", { canManage: false });
    const res = await inviteUserToWorld("a@b.com", "w1", null);
    expect(res.error).toBe("forbidden");
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("laisse passer un gestionnaire, sans rôle (rôles par défaut)", async () => {
    mockCaller("u1", { canManage: true, rank: 30 });
    const res = await inviteUserToWorld("a@b.com", "w1", null);
    expect(res).toEqual({});
    expect(inviteUserByEmail).toHaveBeenCalledWith("a@b.com");
  });

  // La hiérarchie : on ne confère qu'un rôle sous son propre rang — la même
  // règle que la policy `world_invitations_insert`, que le service_role contourne.
  it("refuse un rôle au niveau ou au-dessus du rang de l'inviteur", async () => {
    mockCaller("u1", { canManage: true, rank: 20, role: { id: ROLE_ID, position: 20 } });
    const res = await inviteUserToWorld("a@b.com", "w1", ROLE_ID);
    expect(res.error).toBe("forbidden");
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("refuse un rôle qui n'appartient pas au monde", async () => {
    mockCaller("u1", { canManage: true, rank: 30, role: null });
    const res = await inviteUserToWorld("a@b.com", "w1", ROLE_ID);
    expect(res.error).toBe("forbidden");
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("enregistre l'invitation en base avec le rôle demandé, sous le rang de l'inviteur", async () => {
    mockCaller("u1", { canManage: true, rank: 30, role: { id: ROLE_ID, position: 10 } });
    await inviteUserToWorld("a@b.com", "w1", ROLE_ID);
    expect(adminInsert).toHaveBeenCalledWith("world_invitations", {
      world_id: "w1",
      invitee_id: "invitee-1",
      inviter_id: "u1",
      role_id: ROLE_ID,
    });
  });

  // Le rôle ne doit plus voyager dans `user_metadata` : Supabase laisse
  // l'utilisateur réécrire ses propres métadonnées, elles ne peuvent donc
  // porter aucune décision d'autorisation.
  it("n'envoie aucune métadonnée de rôle ou de monde avec le courriel", async () => {
    mockCaller("u1", { canManage: true, rank: 30 });
    await inviteUserToWorld("a@b.com", "w1", null);
    const args = inviteUserByEmail.mock.calls[0];
    expect(JSON.stringify(args)).not.toMatch(/invited_role|invited_world_id/);
  });

  it("notifie l'invité pour que l'invitation soit visible à sa connexion", async () => {
    mockCaller("u1", { canManage: true, rank: 30 });
    await inviteUserToWorld("a@b.com", "w1", null);
    const notif = adminInsert.mock.calls.find(([table]) => table === "notifications");
    expect(notif?.[1]).toMatchObject({
      recipient_id: "invitee-1",
      type: "world_invite",
      world_id: "w1",
      actor_id: "u1",
    });
  });

  it("remonte le message d'erreur de l'envoi", async () => {
    mockCaller("u1", { canManage: true, rank: 30 });
    inviteUserByEmail.mockResolvedValue({ data: null, error: { message: "déjà invité" } });
    const res = await inviteUserToWorld("a@b.com", "w1", null);
    expect(res.error).toBe("saveFailed");
  });

  it("n'enregistre rien si le compte invité n'a pas pu être créé", async () => {
    mockCaller("u1", { canManage: true, rank: 30 });
    inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: null });
    const res = await inviteUserToWorld("a@b.com", "w1", null);
    expect(res.error).toBe("saveFailed");
    expect(adminInsert).not.toHaveBeenCalled();
  });
});

describe("inviteUserToWorld — entrées forgées", () => {
  // Seule action du dépôt à écrire avec le `service_role`, hors RLS : le rôle
  // n'est retenu par rien d'autre que ce contrôle et `accept_world_invitation`.
  it.each([
    ["un rôle qui n'est pas un identifiant", ["a@b.com", "w1", 42]],
    ["une adresse qui n'en est pas une", ["pas-un-courriel", "w1", null]],
    ["un monde sans identifiant", ["a@b.com", "", null]],
  ])("refuse %s avant même de lire l'appelant", async (_name, [email, worldId, roleId]) => {
    mockCaller("u1", { canManage: true, rank: 30 });
    const res = await inviteUserToWorld(email as string, worldId as string, roleId as never);
    expect(res.error).toBe("unsupportedValue");
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(adminInsert).not.toHaveBeenCalled();
  });
});
