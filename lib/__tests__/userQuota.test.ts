import { describe, it, expect } from "vitest";
import { getUserQuotaWithClient } from "@/lib/userQuota";
import { createSupabaseMock } from "@/test/supabaseMock";

describe("getUserQuotaWithClient", () => {
  it("retourne le fallback free si aucun utilisateur", async () => {
    const mock = createSupabaseMock({ user: null });
    const q = await getUserQuotaWithClient(mock.client as never, null, "worlds");
    expect(q).toEqual({ plan: "free", owned: 0, quotaLimit: 1, quotaReached: false });
  });

  it("défaut au plan free si profil sans plan", async () => {
    const mock = createSupabaseMock({
      results: [{ data: {} }, { count: 0 }],
    });
    const q = await getUserQuotaWithClient(mock.client as never, "u1", "worlds");
    expect(q.plan).toBe("free");
  });

  describe("plan free", () => {
    it("worlds : quota atteint à 1 monde possédé", async () => {
      const mock = createSupabaseMock({
        results: [{ data: { plan: "free" } }, { count: 1 }],
      });
      const q = await getUserQuotaWithClient(mock.client as never, "u1", "worlds");
      expect(q).toMatchObject({ plan: "free", owned: 1, quotaLimit: 1, quotaReached: true });
    });

    it("worlds : quota non atteint à 0 monde possédé", async () => {
      const mock = createSupabaseMock({
        results: [{ data: { plan: "free" } }, { count: 0 }],
      });
      const q = await getUserQuotaWithClient(mock.client as never, "u1", "worlds");
      expect(q).toMatchObject({ plan: "free", owned: 0, quotaLimit: 1, quotaReached: false });
    });

    it("personas : quota non atteint à 4 personas possédées (limite 5)", async () => {
      const mock = createSupabaseMock({
        results: [{ data: { plan: "free" } }, { count: 4 }],
      });
      const q = await getUserQuotaWithClient(mock.client as never, "u1", "personas");
      expect(q).toMatchObject({ plan: "free", owned: 4, quotaLimit: 5, quotaReached: false });
    });

    it("personas : quota atteint à 5 personas possédées", async () => {
      const mock = createSupabaseMock({
        results: [{ data: { plan: "free" } }, { count: 5 }],
      });
      const q = await getUserQuotaWithClient(mock.client as never, "u1", "personas");
      expect(q).toMatchObject({ plan: "free", owned: 5, quotaLimit: 5, quotaReached: true });
    });
  });

  describe("plan subscribed", () => {
    it("worlds : illimité (Infinity), jamais atteint même à 999 mondes", async () => {
      const mock = createSupabaseMock({
        results: [{ data: { plan: "subscribed" } }, { count: 999 }],
      });
      const q = await getUserQuotaWithClient(mock.client as never, "u1", "worlds");
      expect(q).toMatchObject({ plan: "subscribed", quotaLimit: Infinity, quotaReached: false });
    });

    it("personas : illimité (Infinity), jamais atteint même à 999 personas", async () => {
      const mock = createSupabaseMock({
        results: [{ data: { plan: "subscribed" } }, { count: 999 }],
      });
      const q = await getUserQuotaWithClient(mock.client as never, "u1", "personas");
      expect(q).toMatchObject({ plan: "subscribed", quotaLimit: Infinity, quotaReached: false });
    });
  });

  describe("plan déjà connu (knownPlan)", () => {
    it("n'interroge pas `profiles` quand le plan est fourni", async () => {
      // Un seul résultat en file : le comptage. Si `profiles` était encore
      // interrogé, il consommerait ce résultat et le compte serait faux.
      const mock = createSupabaseMock({ results: [{ count: 3 }] });
      const q = await getUserQuotaWithClient(mock.client as never, "u1", "worlds", "subscribed");

      expect(mock.buildersFor("profiles")).toHaveLength(0);
      expect(mock.from).toHaveBeenCalledTimes(1);
      expect(mock.from).toHaveBeenCalledWith("worlds");
      expect(q).toMatchObject({ plan: "subscribed", owned: 3, quotaLimit: Infinity, quotaReached: false });
    });

    it("applique la limite du plan fourni sans relire le profil", async () => {
      const mock = createSupabaseMock({ results: [{ count: 1 }] });
      const q = await getUserQuotaWithClient(mock.client as never, "u1", "worlds", "free");

      expect(mock.buildersFor("profiles")).toHaveLength(0);
      expect(q).toMatchObject({ plan: "free", owned: 1, quotaLimit: 1, quotaReached: true });
    });

    it("retombe sur la lecture du profil quand le plan n'est pas fourni", async () => {
      const mock = createSupabaseMock({
        results: [{ data: { plan: "lifetime" } }, { count: 999 }],
      });
      const q = await getUserQuotaWithClient(mock.client as never, "u1", "worlds");

      expect(mock.buildersFor("profiles")).toHaveLength(1);
      expect(q).toMatchObject({ plan: "lifetime", quotaLimit: Infinity });
    });
  });

  describe("plan lifetime", () => {
    it("worlds : illimité (Infinity), jamais atteint même à 999 mondes", async () => {
      const mock = createSupabaseMock({
        results: [{ data: { plan: "lifetime" } }, { count: 999 }],
      });
      const q = await getUserQuotaWithClient(mock.client as never, "u1", "worlds");
      expect(q).toMatchObject({ plan: "lifetime", quotaLimit: Infinity, quotaReached: false });
    });

    it("personas : illimité (Infinity), jamais atteint même à 999 personas", async () => {
      const mock = createSupabaseMock({
        results: [{ data: { plan: "lifetime" } }, { count: 999 }],
      });
      const q = await getUserQuotaWithClient(mock.client as never, "u1", "personas");
      expect(q).toMatchObject({ plan: "lifetime", quotaLimit: Infinity, quotaReached: false });
    });
  });
});
