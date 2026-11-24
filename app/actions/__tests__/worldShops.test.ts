import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  addWorldShop,
  updateWorldShop,
  deleteWorldShop,
  addWorldShopItem,
  updateWorldShopItem,
  removeWorldShopItem,
} from "@/app/actions/worldShops";
import { MAX_SHOP_PRICE } from "@/lib/worldShops";
import { createClient } from "@/lib/supabase/server";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

const shopRow = { id: "s1", world_id: "w1", name: "Forge", sort_index: 2 };

describe("addWorldShop", () => {
  it("ajoute la boutique au bout de la liste, nom nettoyé", async () => {
    const mock = createSupabaseMock({
      results: [{ data: [{ sort_index: 1 }], error: null }, { data: shopRow, error: null }],
    });
    use(mock);
    const res = await addWorldShop("w1", { name: "  Forge " });
    expect(res).toEqual({ ok: true, shop: shopRow });
    expect(mock.buildersFor("world_shops")[1].insert).toHaveBeenCalledWith({ world_id: "w1", name: "Forge", sort_index: 2 });
  });

  it("refuse une saisie invalide sans rien écrire", async () => {
    const mock = createSupabaseMock({ results: [] });
    use(mock);
    expect((await addWorldShop("w1", { name: " " })).ok).toBe(false);
    expect((await addWorldShop("w1", { name: "F", buyback_percent: 150 })).ok).toBe(false);
    expect(mock.buildersFor("world_shops")).toHaveLength(0);
  });

  it("remonte un refus de la base", async () => {
    use(createSupabaseMock({ results: [{ data: [], error: null }, { data: null, error: { message: "RLS" } }] }));
    expect(await addWorldShop("w1", { name: "Forge" })).toEqual({ ok: false, error: "saveFailed" });
  });
});

describe("updateWorldShop", () => {
  it("n'écrit que les champs donnés", async () => {
    const mock = createSupabaseMock({ results: [{ data: [{ id: "s1" }], error: null }] });
    use(mock);
    const res = await updateWorldShop("s1", { buyback_enabled: true, buyback_percent: 40 });
    expect(res).toEqual({ ok: true });
    expect(mock.buildersFor("world_shops")[0].update).toHaveBeenCalledWith({ buyback_enabled: true, buyback_percent: 40 });
  });

  it("aucune ligne touchée : la boutique est introuvable (ou la RLS a refusé)", async () => {
    use(createSupabaseMock({ results: [{ data: [], error: null }] }));
    expect(await updateWorldShop("s1", { is_open: false })).toEqual({ ok: false, error: "notFound" });
  });

  it("refuse un champ inconnu", async () => {
    use(createSupabaseMock({ results: [] }));
    expect((await updateWorldShop("s1", { world_id: "w2" } as never)).ok).toBe(false);
  });
});

describe("deleteWorldShop", () => {
  it("supprime et vérifie qu'une ligne est partie", async () => {
    use(createSupabaseMock({ results: [{ data: [{ id: "s1" }], error: null }] }));
    expect(await deleteWorldShop("s1")).toEqual({ ok: true });
    use(createSupabaseMock({ results: [{ data: [], error: null }] }));
    expect(await deleteWorldShop("s1")).toEqual({ ok: false, error: "notFound" });
  });
});

describe("articles", () => {
  const itemRow = { id: "i1", shop_id: "s1", catalog_item_id: "c1", price: 50, stock: null, buyback_price: null, sort_index: 0 };

  it("ajoute un objet du catalogue au bout de la boutique", async () => {
    const mock = createSupabaseMock({
      results: [{ data: [], error: null }, { data: itemRow, error: null }],
    });
    use(mock);
    const res = await addWorldShopItem("s1", "c1", { price: 50 });
    expect(res).toEqual({ ok: true, item: itemRow });
    expect(mock.buildersFor("world_shop_items")[1].insert).toHaveBeenCalledWith({
      shop_id: "s1",
      catalog_item_id: "c1",
      price: 50,
      stock: null,
      buyback_price: null,
      sort_index: 0,
    });
  });

  it("un objet déjà en vente dans la boutique : code dédié", async () => {
    use(createSupabaseMock({ results: [{ data: [], error: null }, { data: null, error: { code: "23505", message: "dup" } }] }));
    expect(await addWorldShopItem("s1", "c1", { price: 1 })).toEqual({ ok: false, error: "shopItemDuplicate" });
  });

  it("refuse un prix hors bornes", async () => {
    use(createSupabaseMock({ results: [] }));
    expect((await addWorldShopItem("s1", "c1", { price: MAX_SHOP_PRICE + 1 })).ok).toBe(false);
    expect((await updateWorldShopItem("i1", { price: -1 })).ok).toBe(false);
  });

  it("modifie prix, stock et rachat", async () => {
    const mock = createSupabaseMock({ results: [{ data: [{ id: "i1" }], error: null }] });
    use(mock);
    expect(await updateWorldShopItem("i1", { price: 10, stock: 5, buyback_price: null })).toEqual({ ok: true });
    expect(mock.buildersFor("world_shop_items")[0].update).toHaveBeenCalledWith({ price: 10, stock: 5, buyback_price: null });
  });

  it("retire un article", async () => {
    use(createSupabaseMock({ results: [{ data: [{ id: "i1" }], error: null }] }));
    expect(await removeWorldShopItem("i1")).toEqual({ ok: true });
    use(createSupabaseMock({ results: [{ data: [], error: null }] }));
    expect(await removeWorldShopItem("i1")).toEqual({ ok: false, error: "notFound" });
  });
});
