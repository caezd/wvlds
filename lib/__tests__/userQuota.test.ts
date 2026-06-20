import { describe, it, expect } from "vitest";
import { getUserQuotaWithClient } from "@/lib/userQuota";
import { createSupabaseMock } from "@/test/supabaseMock";

describe("getUserQuotaWithClient", () => {
  it("retourne le fallback free si aucun utilisateur", async () => {
    const mock = createSupabaseMock({ user: null });
    const q = await getUserQuotaWithClient(mock.client as never, null, "worlds");
    expect(q).toEqual({ plan: "free", owned: 0, quotaLimit: 1, quotaReached: false });
  });

  it("compte free worlds : quota atteint à 1 monde possédé", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: { plan: "free" } }, // profiles
        { count: 1 }, // count worlds
      ],
    });
    const q = await getUserQuotaWithClient(mock.client as never, "u1", "worlds");
    expect(q).toMatchObject({ plan: "free", owned: 1, quotaLimit: 1, quotaReached: true });
  });

  it("free personas : limite à 2, pas encore atteinte à 1", async () => {
    const mock = createSupabaseMock({
      results: [{ data: { plan: "free" } }, { count: 1 }],
    });
    const q = await getUserQuotaWithClient(mock.client as never, "u1", "personas");
    expect(q).toMatchObject({ owned: 1, quotaLimit: 2, quotaReached: false });
  });

  it("plan pro : quota illimité (Infinity), jamais atteint", async () => {
    const mock = createSupabaseMock({
      results: [{ data: { plan: "pro" } }, { count: 999 }],
    });
    const q = await getUserQuotaWithClient(mock.client as never, "u1", "worlds");
    expect(q.quotaLimit).toBe(Infinity);
    expect(q.quotaReached).toBe(false);
  });

  it("défaut au plan free si profil sans plan", async () => {
    const mock = createSupabaseMock({
      results: [{ data: {} }, { count: 0 }],
    });
    const q = await getUserQuotaWithClient(mock.client as never, "u1", "worlds");
    expect(q.plan).toBe("free");
  });
});
