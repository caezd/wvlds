import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { useWorldShops } from "@/hooks/useWorldShops";
import { createClient } from "@/lib/supabase/client";

const WORLD = { enable_economy: true, enable_inventory: true, enable_shops: true, currency_units: [{ name: "Or", short: "po", value: 1 }] };
const forge = { id: "s1", world_id: "w1", name: "Forge", description: null, lucide_icon: null, is_open: true, buyback_enabled: true, buyback_percent: 50, sort_index: 0 };
const herbo = { ...forge, id: "s2", name: "Herboriste", sort_index: 1 };
const epee = { id: "c1", name: "Épée", deleted_at: null };
const article = (id: string, shop: string, patch: Record<string, unknown> = {}) => ({
  id, shop_id: shop, catalog_item_id: "c1", price: 10, stock: null, buyback_price: null, sort_index: 0, catalog: epee, ...patch,
});

function charger(extra: Record<string, unknown>[] = []) {
  const mock = createSupabaseMock({
    results: [
      { data: WORLD },
      { data: [forge, herbo] },
      { data: [article("i1", "s1"), article("i2", "s2", { stock: 3 })] },
      { data: [{ id: "p1", name: "Brom", avatar_url: null }] },
      { data: [] },
      { data: [{ persona_id: "p1", balance: 42 }] },
      { data: [{ persona_id: "p1", catalog_item_id: "c1", quantity: 2 }] },
      ...extra,
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => vi.clearAllMocks());

describe("useWorldShops (migration 249)", () => {
  it("option Boutiques coupée : rien d'autre n'est lu", async () => {
    const mock = createSupabaseMock({ results: [{ data: { ...WORLD, enable_shops: false } }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const { result } = renderHook(() => useWorldShops("w1", "u1", false));
    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(mock.buildersFor("world_shops")).toHaveLength(0);
  });

  it("économie ou inventaire coupés : rien d'autre n'est lu", async () => {
    const mock = createSupabaseMock({ results: [{ data: { ...WORLD, enable_inventory: false } }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const { result } = renderHook(() => useWorldShops("w1", "u1", false));
    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(mock.buildersFor("world_shops")).toHaveLength(0);
  });

  it("charge les boutiques, leurs articles, mes personas, leurs bourses et ce qu'ils portent", async () => {
    const mock = charger();
    const { result } = renderHook(() => useWorldShops("w1", "u1", false));
    await waitFor(() => expect(result.current.status).toBe("on"));
    expect(result.current.shops.map((s) => s.name)).toEqual(["Forge", "Herboriste"]);
    expect(result.current.itemsOf("s2").map((i) => i.id)).toEqual(["i2"]);
    expect(result.current.personas).toEqual([{ id: "p1", name: "Brom", avatar_url: null, balance: 42 }]);
    expect(result.current.held("p1", "c1")).toBe(2);
    expect(result.current.held("p1", "c9")).toBe(0);
    expect(result.current.units[0].short).toBe("po");
    // Mes personas seulement, vivants, hors modèles.
    const personas = mock.buildersFor("personas")[0];
    expect(personas.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(personas.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("acheter passe par la RPC puis relit bourses, possessions et stocks", async () => {
    const mock = charger([
      { data: [article("i1", "s1"), article("i2", "s2", { stock: 1 })] },
      { data: [{ persona_id: "p1", balance: 22 }] },
      { data: [{ persona_id: "p1", catalog_item_id: "c1", quantity: 4 }] },
    ]);
    mock.client.rpc.mockResolvedValueOnce({ data: 22, error: null });
    const { result } = renderHook(() => useWorldShops("w1", "u1", false));
    await waitFor(() => expect(result.current.status).toBe("on"));

    let res: Awaited<ReturnType<typeof result.current.buy>> | undefined;
    await act(async () => {
      res = await result.current.buy("p1", "i2", 2);
    });
    expect(res).toEqual({ ok: true });
    expect(mock.client.rpc).toHaveBeenCalledWith("buy_shop_item", { p_persona: "p1", p_shop_item: "i2", p_quantity: 2 });
    expect(result.current.personas[0].balance).toBe(22);
    expect(result.current.held("p1", "c1")).toBe(4);
    expect(result.current.itemsOf("s2")[0].stock).toBe(1);
  });

  it("traduit les refus de la base", async () => {
    const mock = charger();
    const { result } = renderHook(() => useWorldShops("w1", "u1", false));
    await waitFor(() => expect(result.current.status).toBe("on"));
    const cas: [string, string][] = [
      ["Stock épuisé.", "stock"],
      ["Solde insuffisant.", "funds"],
      ["Inventaire plein.", "full"],
      ["Quantité maximale dépassée.", "max"],
      ["Quantité insuffisante.", "insufficient"],
      ["autre chose", "failed"],
    ];
    for (const [message, code] of cas) {
      mock.client.rpc.mockResolvedValueOnce({ data: null, error: { message } });
      let res: unknown;
      await act(async () => {
        res = await result.current.sell("p1", "i1", 1);
      });
      expect(res).toEqual({ ok: false, error: code });
    }
    expect(mock.client.rpc).toHaveBeenLastCalledWith("sell_shop_item", { p_persona: "p1", p_shop_item: "i1", p_quantity: 1 });
  });

  it("qui gère l'économie reçoit aussi le catalogue des objets", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: WORLD },
        { data: [forge] },
        { data: [] },
        { data: [] },
        { data: [{ id: "c1", name: "Épée", type: "inventory" }] },
      ],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const { result } = renderHook(() => useWorldShops("w1", "u1", true));
    await waitFor(() => expect(result.current.status).toBe("on"));
    expect(result.current.catalog.map((c) => c.id)).toEqual(["c1"]);
  });
});
