import { describe, it, expect, vi, beforeEach } from "vitest";

const inviteUserByEmail = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { inviteUserByEmail } } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { inviteUserToWorld } from "@/app/actions/invite";
import { createClient } from "@/lib/supabase/server";

function mockAuth(claims: unknown) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: claims }) },
  } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("inviteUserToWorld", () => {
  it("retourne une erreur si non authentifié", async () => {
    mockAuth(null);
    const res = await inviteUserToWorld("a@b.com", "w1", "player");
    expect(res.error).toMatch(/authentifié/i);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("invite l'utilisateur avec les métadonnées monde + rôle", async () => {
    mockAuth({ sub: "u1" });
    inviteUserByEmail.mockResolvedValue({ error: null });
    const res = await inviteUserToWorld("a@b.com", "w1", "editor");
    expect(res).toEqual({});
    expect(inviteUserByEmail).toHaveBeenCalledWith("a@b.com", {
      data: { invited_world_id: "w1", invited_role: "editor" },
    });
  });

  it("remonte le message d'erreur de l'invitation", async () => {
    mockAuth({ sub: "u1" });
    inviteUserByEmail.mockResolvedValue({ error: { message: "déjà invité" } });
    const res = await inviteUserToWorld("a@b.com", "w1", "player");
    expect(res.error).toBe("déjà invité");
  });
});
