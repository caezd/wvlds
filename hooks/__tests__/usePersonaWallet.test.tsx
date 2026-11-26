import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { WALLET_LEDGER_LIMIT, usePersonaWallet } from "@/hooks/usePersonaWallet";
import { createClient } from "@/lib/supabase/client";

const OR = [
  { name: "Cuivre", short: "pc", value: 1 },
  { name: "Argent", short: "pa", value: 100 },
];
const mouvement = (id: string, delta: number, balance_after: number) => ({
  id, delta, balance_after, kind: "adjust", note: null, created_at: "2026-11-24T10:00:00Z",
});

beforeEach(() => vi.clearAllMocks());

function use(mock: ReturnType<typeof createSupabaseMock>) {
  vi.mocked(createClient).mockReturnValue(mock.client as never);
}

describe("usePersonaWallet (migration 246)", () => {
  it("économie coupée dans le monde : rien d'autre n'est lu", async () => {
    const mock = createSupabaseMock({ results: [{ data: { enable_economy: false, currency_units: OR } }] });
    use(mock);
    const { result } = renderHook(() => usePersonaWallet("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(mock.buildersFor("persona_wallets")).toHaveLength(0);
  });

  it("sans monde, rien n'est lu", () => {
    const mock = createSupabaseMock();
    use(mock);
    const { result } = renderHook(() => usePersonaWallet("p1", null));
    expect(result.current.status).toBe("off");
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("lit la monnaie, le solde et les derniers mouvements", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: { enable_economy: true, currency_units: OR } },
        { data: { balance: 500 } },
        { data: [mouvement("m1", 500, 500)] },
      ],
    });
    use(mock);
    const { result } = renderHook(() => usePersonaWallet("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    expect(result.current.units.map((u) => u.name)).toEqual(["Argent", "Cuivre"]);
    expect(result.current.balance).toBe(500);
    expect(result.current.ledger.map((m) => m.id)).toEqual(["m1"]);
  });

  it("une bourse jamais utilisée vaut zéro", async () => {
    use(createSupabaseMock({
      results: [{ data: { enable_economy: true, currency_units: OR } }, { data: null }, { data: [] }],
    }));
    const { result } = renderHook(() => usePersonaWallet("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    expect(result.current.balance).toBe(0);
  });

  it("ajuste par la fonction de la base, puis relit les mouvements", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: { enable_economy: true, currency_units: OR } },
        { data: { balance: 500 } },
        { data: [] },
        { data: [mouvement("m2", -200, 300)] },
      ],
    });
    use(mock);
    mock.rpc.mockResolvedValueOnce({ data: 300, error: null });
    const { result } = renderHook(() => usePersonaWallet("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    let res: Awaited<ReturnType<typeof result.current.adjust>> | undefined;
    await act(async () => { res = await result.current.adjust(-200, "Amende"); });
    expect(res).toEqual({ ok: true });
    expect(mock.rpc).toHaveBeenCalledWith("adjust_persona_balance", { p_persona: "p1", p_delta: -200, p_note: "Amende" });
    expect(result.current.balance).toBe(300);
    await waitFor(() => expect(result.current.ledger.map((m) => m.id)).toEqual(["m2"]));
  });

  it("un solde insuffisant est dit comme tel, le solde ne bouge pas", async () => {
    const mock = createSupabaseMock({
      results: [{ data: { enable_economy: true, currency_units: OR } }, { data: { balance: 100 } }, { data: [] }],
    });
    use(mock);
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "23514", message: "Solde insuffisant." } });
    const { result } = renderHook(() => usePersonaWallet("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    let res: Awaited<ReturnType<typeof result.current.adjust>> | undefined;
    await act(async () => { res = await result.current.adjust(-500, ""); });
    expect(res).toEqual({ ok: false, error: "insufficient" });
    expect(result.current.balance).toBe(100);
  });
  it("relit solde et mouvements à la demande (achat d'emplacement)", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: { enable_economy: true, currency_units: OR } },
        { data: { balance: 500 } },
        { data: [] },
        { data: { balance: 250 } },
        { data: [mouvement("m3", -250, 250)] },
      ],
    });
    use(mock);
    const { result } = renderHook(() => usePersonaWallet("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.balance).toBe(250);
    expect(result.current.ledger.map((m) => m.id)).toEqual(["m3"]);
  });

  it("dit s'il reste des mouvements plus anciens, et les ajoute à la suite", async () => {
    const page = Array.from({ length: WALLET_LEDGER_LIMIT }, (_, i) => mouvement(`m${i}`, 1, i));
    const mock = createSupabaseMock({
      results: [
        { data: { enable_economy: true, currency_units: OR } },
        { data: { balance: 500 } },
        { data: page },
        // Le mouvement m19 revient : un nouveau mouvement a décalé la liste entre-temps.
        { data: [page[WALLET_LEDGER_LIMIT - 1], mouvement("old", -3, 0)] },
      ],
    });
    use(mock);
    const { result } = renderHook(() => usePersonaWallet("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    expect(result.current.hasMore).toBe(true);

    await act(async () => { await result.current.loadMore(); });
    const suite = mock.buildersFor("world_economy_ledger").at(-1)!;
    expect(suite.range).toHaveBeenCalledWith(WALLET_LEDGER_LIMIT, 2 * WALLET_LEDGER_LIMIT - 1);
    expect(result.current.ledger).toHaveLength(WALLET_LEDGER_LIMIT + 1);
    expect(result.current.ledger.at(-1)?.id).toBe("old");
    expect(result.current.hasMore).toBe(false);
  });

  it("une première page incomplète : rien de plus à charger", async () => {
    use(createSupabaseMock({
      results: [{ data: { enable_economy: true, currency_units: OR } }, { data: null }, { data: [mouvement("m1", 1, 1)] }],
    }));
    const { result } = renderHook(() => usePersonaWallet("p1", "w1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    expect(result.current.hasMore).toBe(false);
  });
});
