import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { usePersonaInventory } from "@/hooks/usePersonaInventory";
import { createClient } from "@/lib/supabase/client";

const WORLD = {
  enable_inventory: true,
  enable_economy: true,
  inventory_mode: "free",
  inventory_slots_default: 3,
  inventory_slots_max: 5,
  inventory_slot_cost: 100,
};
const epee = { id: "c-epee", name: "Épée", stackable: false, max_quantity: null, deleted_at: null };
const ligne = (id: string, patch: Record<string, unknown>) => ({
  id, catalog_item_id: null, name: null, description: null, icon: null, lucide_icon: null, quantity: 1, sort_index: 0, catalog: null, ...patch,
});

function charger(items: unknown[], extra = 0, world: Record<string, unknown> = WORLD) {
  const mock = createSupabaseMock({
    results: [
      { data: world },
      { data: items },
      { data: { extra_slots: extra } },
      { data: [epee] },
      { data: [] },
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => vi.clearAllMocks());

describe("usePersonaInventory (migration 247)", () => {
  it("inventaire coupé dans le monde : rien d'autre n'est lu", async () => {
    const mock = createSupabaseMock({ results: [{ data: { ...WORLD, enable_inventory: false } }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const { result } = renderHook(() => usePersonaInventory("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(mock.buildersFor("persona_items")).toHaveLength(0);
  });

  it("compte les emplacements et la capacité, propose l'agrandissement", async () => {
    charger([
      ligne("r1", { name: "Caillou" }),
      ligne("r2", { catalog_item_id: "c-epee", quantity: 2, catalog: epee }),
    ], 1);
    const { result } = renderHook(() => usePersonaInventory("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    expect(result.current.mode).toBe("free");
    expect(result.current.used).toBe(3);
    expect(result.current.capacity).toBe(4);
    expect(result.current.extension).toEqual({ cost: 100, remaining: 1 });
    expect(result.current.catalog.map((c) => c.id)).toEqual(["c-epee"]);
  });

  it("ajoute un objet libre en fin d'inventaire, puis relit", async () => {
    const mock = charger([ligne("r1", { name: "Caillou", sort_index: 4 })]);
    const { result } = renderHook(() => usePersonaInventory("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    let res: Awaited<ReturnType<typeof result.current.addCustom>> | undefined;
    await act(async () => { res = await result.current.addCustom("  Corde  ", ""); });
    expect(res).toEqual({ ok: true });
    expect(mock.buildersFor("persona_items")[1].insert).toHaveBeenCalledWith({
      persona_id: "p1", world_id: "w1", name: "Corde", description: null, quantity: 1, sort_index: 5,
    });
  });

  it("un inventaire plein est dit comme tel", async () => {
    const mock = charger([]);
    const { result } = renderHook(() => usePersonaInventory("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    mock.enqueue({ error: { code: "23514", message: "Inventaire plein." } });
    let res: Awaited<ReturnType<typeof result.current.addCatalog>> | undefined;
    await act(async () => { res = await result.current.addCatalog("c-epee", 1); });
    expect(res).toEqual({ ok: false, error: "full" });
  });

  it("donner passe par la base ; agrandir aussi", async () => {
    const mock = charger([]);
    const { result } = renderHook(() => usePersonaInventory("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    mock.rpc.mockResolvedValue({ data: 1, error: null });
    await act(async () => { await result.current.give("c-epee", 2); });
    expect(mock.rpc).toHaveBeenCalledWith("adjust_persona_item", { p_persona: "p1", p_item: "c-epee", p_delta: 2 });
    await act(async () => { await result.current.extend(1); });
    expect(mock.rpc).toHaveBeenCalledWith("extend_persona_inventory", { p_persona: "p1", p_slots: 1 });
  });
});
