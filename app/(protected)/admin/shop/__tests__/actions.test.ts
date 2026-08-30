import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { revalidatePath } from "next/cache";
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

import { createItem, updateItem, toggleItem, deleteItem } from "@/app/(protected)/admin/shop/actions";

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

// ──────────────────────────────────────────────────────────────────────────
// Les trois autres actions de la boutique.
//
// `toggleItem` et `deleteItem` sont appelées depuis un `<form action={…}>` :
// elles ne peuvent rien renvoyer à l'écran, et LÈVENT donc en cas d'échec —
// sans quoi `revalidatePath` réafficherait l'état d'avant comme si de rien
// n'était.
//
// Ce qu'elles jetaient était une phrase française contenant `error.message`,
// c'est-à-dire le texte brut de PostgreSQL, qui nomme la table et la règle.
// Elles jettent désormais un code ; le détail reste dans les journaux serveur.
// ──────────────────────────────────────────────────────────────────────────

describe("updateItem", () => {
  it("écrit sur le bon identifiant, puis redirige", async () => {
    const mock = createSupabaseMock({ results: [{ error: null }] });
    requireAdmin.mockResolvedValue({ supabase: mock.client });

    await expect(updateItem("item-7", null, fd(validItem))).rejects.toThrow("REDIRECT:/admin/shop");

    const b = mock.buildersFor("cosmetic_items")[0];
    expect(b.update).toHaveBeenCalledWith(
      expect.objectContaining({ key: "cadre-or", price_coins: 100 }),
    );
    expect(b.eq).toHaveBeenCalledWith("id", "item-7");
  });

  it("refuse une saisie invalide sans rien écrire", async () => {
    const mock = createSupabaseMock();
    requireAdmin.mockResolvedValue({ supabase: mock.client });
    const res = await updateItem("item-7", null, fd({ ...validItem, price_coins: "-3" }));
    expect(res).toMatchObject({ ok: false });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("rend un code, jamais le message de la base", async () => {
    const brut = 'new row violates row-level security policy for table "cosmetic_items"';
    const mock = createSupabaseMock({ results: [{ error: { message: brut } }] });
    requireAdmin.mockResolvedValue({ supabase: mock.client });
    const res = await updateItem("item-7", null, fd(validItem));
    expect(res).toEqual({ ok: false, error: "saveFailed" });
    expect(JSON.stringify(res)).not.toContain("cosmetic_items");
  });
});

describe("toggleItem", () => {
  it("bascule l'état de l'article visé", async () => {
    const mock = createSupabaseMock({ results: [{ error: null }] });
    requireAdmin.mockResolvedValue({ supabase: mock.client });

    await toggleItem("item-7", false);

    const b = mock.buildersFor("cosmetic_items")[0];
    expect(b.update).toHaveBeenCalledWith({ active: false });
    expect(b.eq).toHaveBeenCalledWith("id", "item-7");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/shop");
  });

  it("lève en cas d'échec, sans revalider", async () => {
    // Revalider après un échec réafficherait l'ancien état : l'administrateur
    // croirait son action passée.
    const mock = createSupabaseMock({ results: [{ error: { message: "boum" } }] });
    requireAdmin.mockResolvedValue({ supabase: mock.client });

    await expect(toggleItem("item-7", true)).rejects.toThrow();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ne recopie pas le message de la base dans l'exception", async () => {
    const brut = 'permission denied for table "cosmetic_items"';
    const mock = createSupabaseMock({ results: [{ error: { message: brut } }] });
    requireAdmin.mockResolvedValue({ supabase: mock.client });

    await expect(toggleItem("item-7", true)).rejects.toThrow(/^saveFailed$/);
  });
});

describe("deleteItem", () => {
  it("supprime l'article visé", async () => {
    const mock = createSupabaseMock({ results: [{ error: null }] });
    requireAdmin.mockResolvedValue({ supabase: mock.client });

    await deleteItem("item-7");

    const b = mock.buildersFor("cosmetic_items")[0];
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith("id", "item-7");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/shop");
  });

  it("lève sans revalider, et sans le message de la base", async () => {
    const mock = createSupabaseMock({
      results: [{ error: { message: 'update or delete on table "cosmetic_items" violates foreign key' } }],
    });
    requireAdmin.mockResolvedValue({ supabase: mock.client });

    await expect(deleteItem("item-7")).rejects.toThrow(/^saveFailed$/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
