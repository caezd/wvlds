import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { usePersonaTransfer } from "@/hooks/usePersonaTransfer";
import { createClient } from "@/lib/supabase/client";

const WORLD = {
  enable_trades: true,
  trades_same_account: false,
  enable_economy: true,
  enable_inventory: true,
  currency_units: [{ name: "Or", short: "po", value: 1 }],
};
const PERSONAS = [
  { id: "p1", name: "Brom", avatar_url: null, user_id: "u1", is_npc: false },
  { id: "p2", name: "Corvin", avatar_url: null, user_id: "u1", is_npc: false },
  { id: "p3", name: "Aria", avatar_url: null, user_id: "u2", is_npc: false },
];
const potion = { id: "i1", catalog_item_id: "c1", name: null, quantity: 3, catalog: { id: "c1", name: "Potion" } };

function setup(world: Record<string, unknown> = WORLD, extra: Record<string, unknown>[] = []) {
  const mock = createSupabaseMock({
    results: [
      { data: world },
      { data: { balance: 120 } },
      { data: [potion] },
      { data: PERSONAS },
      ...extra,
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => vi.clearAllMocks());

describe("usePersonaTransfer (migration 251)", () => {
  it("option Échanges coupée : off, rien d'autre n'est lu", async () => {
    const mock = setup({ ...WORLD, enable_trades: false });
    const { result } = renderHook(() => usePersonaTransfer("w1", "p1"));
    await waitFor(() => expect(result.current.status).toBe("off"));
    await act(async () => { await result.current.load(); });
    expect(mock.buildersFor("persona_items")).toHaveLength(0);
  });

  it("sans persona : off", async () => {
    setup();
    const { result } = renderHook(() => usePersonaTransfer("w1", null));
    await waitFor(() => expect(result.current.status).toBe("off"));
  });

  it("ne lit bourse, objets et destinataires qu'à l'ouverture", async () => {
    const mock = setup();
    const { result } = renderHook(() => usePersonaTransfer("w1", "p1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    expect(mock.buildersFor("persona_items")).toHaveLength(0);

    await act(async () => { await result.current.load(); });
    expect(result.current.balance).toBe(120);
    expect(result.current.items.map((i) => i.id)).toEqual(["i1"]);
    expect(result.current.units[0].short).toBe("po");
    // Ni lui-même, ni un persona du même compte : le monde ne l'autorise pas.
    expect(result.current.recipients.map((r) => r.name)).toEqual(["Aria"]);
  });

  it("les personas du même compte, si le monde l'autorise", async () => {
    setup({ ...WORLD, trades_same_account: true });
    const { result } = renderHook(() => usePersonaTransfer("w1", "p1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    await act(async () => { await result.current.load(); });
    expect(result.current.recipients.map((r) => r.name)).toEqual(["Corvin", "Aria"]);
  });

  it("transférer passe par la RPC et rend l'identifiant du transfert", async () => {
    const mock = setup();
    mock.client.rpc.mockResolvedValueOnce({ data: "t1", error: null });
    const { result } = renderHook(() => usePersonaTransfer("w1", "p1"));
    await waitFor(() => expect(result.current.status).toBe("on"));

    let res: unknown;
    await act(async () => {
      res = await result.current.send({ to: "p3", amount: 50, items: [{ id: "i1", quantity: 2 }], chatId: "ch1" });
    });
    expect(res).toEqual({ ok: true, id: "t1" });
    expect(mock.client.rpc).toHaveBeenCalledWith("transfer_to_persona", {
      p_from: "p1", p_to: "p3", p_amount: 50, p_items: [{ id: "i1", quantity: 2 }], p_chat: "ch1",
    });
  });

  it("traduit les refus de la base", async () => {
    const mock = setup();
    const { result } = renderHook(() => usePersonaTransfer("w1", "p1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    const cas: [string, string][] = [
      ["Solde insuffisant.", "funds"],
      ["Inventaire plein.", "full"],
      ["Quantité maximale dépassée.", "max"],
      ["Quantité insuffisante.", "insufficient"],
      ["Échanges entre personas d'un même compte désactivés.", "sameAccount"],
      ["Les échanges de ce monde sont désactivés.", "off"],
      ["autre chose", "failed"],
    ];
    for (const [message, code] of cas) {
      mock.client.rpc.mockResolvedValueOnce({ data: null, error: { message } });
      let res: unknown;
      await act(async () => {
        res = await result.current.send({ to: "p3", amount: 1, items: [], chatId: null });
      });
      expect(res).toEqual({ ok: false, error: code });
    }
  });
});
