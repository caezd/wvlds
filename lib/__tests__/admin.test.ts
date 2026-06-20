import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
// redirect() lève normalement pour interrompre l'exécution — on simule ça.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

import { requireAdmin, isAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

describe("requireAdmin", () => {
  it("redirige vers /auth/login si non connecté", async () => {
    use(createSupabaseMock({ user: null }));
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/auth/login");
  });

  it("redirige vers / si l'utilisateur n'est pas admin", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ data: { is_admin: false } }] }));
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/");
  });

  it("retourne user + supabase pour un admin", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: { is_admin: true } }] });
    use(mock);
    const res = await requireAdmin();
    expect(res.user).toEqual({ id: "u1" });
    expect(res.supabase).toBe(mock.client);
  });
});

describe("isAdmin", () => {
  it("false si non connecté", async () => {
    use(createSupabaseMock({ user: null }));
    expect(await isAdmin()).toBe(false);
  });

  it("true si profil is_admin", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ data: { is_admin: true } }] }));
    expect(await isAdmin()).toBe(true);
  });

  it("false si profil non-admin", async () => {
    use(createSupabaseMock({ user: { id: "u1" }, results: [{ data: { is_admin: false } }] }));
    expect(await isAdmin()).toBe(false);
  });
});
