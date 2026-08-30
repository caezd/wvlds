import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

import { createItem } from "@/app/(protected)/admin/shop/actions";

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const validItem = {
  key: "cadre-or",
  name: "Cadre Or",
  slot: "avatar_frame",
  price_coins: "100",
  asset_url: "https://cdn.test/asset.png",
};

beforeEach(() => vi.clearAllMocks());

describe("createItem", () => {
  it("retourne une erreur de validation pour une clé invalide (majuscules)", async () => {
    const mock = createSupabaseMock();
    requireAdmin.mockResolvedValue({ supabase: mock.client });
    const res = await createItem(null, fd({ ...validItem, key: "Cadre OR" }));
    expect(res).toMatchObject({ ok: false });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("retourne une erreur si l'URL d'asset est invalide", async () => {
    const mock = createSupabaseMock();
    requireAdmin.mockResolvedValue({ supabase: mock.client });
    const res = await createItem(null, fd({ ...validItem, asset_url: "pas-une-url" }));
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/asset/i) });
  });

  it("insère puis redirige quand l'item est valide", async () => {
    const mock = createSupabaseMock({ results: [{ error: null }] });
    requireAdmin.mockResolvedValue({ supabase: mock.client });
    // redirect lève -> on attend le throw sentinelle après insertion réussie
    await expect(createItem(null, fd(validItem))).rejects.toThrow("REDIRECT:/admin/shop");
    expect(mock.buildersFor("cosmetic_items")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ key: "cadre-or", price_coins: 100, active: true }),
    );
  });

  it("remonte l'erreur Supabase sans rediriger", async () => {
    const mock = createSupabaseMock({ results: [{ error: { message: "doublon" } }] });
    requireAdmin.mockResolvedValue({ supabase: mock.client });
    const res = await createItem(null, fd(validItem));
    expect(res).toEqual({ ok: false, error: "saveFailed" });
  });
});
