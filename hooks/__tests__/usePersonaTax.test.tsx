import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

import { createSupabaseMock } from "@/test/supabaseMock";

let mock = createSupabaseMock();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => mock.client }));
vi.mock("@/lib/taxBadgeStore", () => ({ invalidateTaxBadges: vi.fn() }));

import { usePersonaTax } from "@/hooks/usePersonaTax";
import { invalidateTaxBadges } from "@/lib/taxBadgeStore";

const MONDE = { enable_economy: true, tax_enabled: true, tax_amount: 150, tax_every: 1, tax_unit: "month", tax_mode: "manual" };
const DETTE = { id: "d1", period_start: "2026-01-01T00:00:00Z", period_end: "2026-02-01T00:00:00Z", amount: "150" };

beforeEach(() => vi.clearAllMocks());

describe("usePersonaTax", () => {
  it("lit le monde du persona, puis ses dettes non réglées", async () => {
    mock = createSupabaseMock({ results: [{ data: { world_id: "w1" } }, { data: MONDE }, { data: [DETTE] }] });
    const { result } = renderHook(() => usePersonaTax("p1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    expect(result.current.dues).toEqual([{ ...DETTE, amount: 150 }]);
    expect(result.current.settings?.tax_amount).toBe(150);
    const dues = mock.builders[2];
    expect(dues.table).toBe("persona_tax_dues");
    expect(dues.builder.eq).toHaveBeenCalledWith("persona_id", "p1");
    expect(dues.builder.is).toHaveBeenCalledWith("paid_at", null);
    expect(dues.builder.is).toHaveBeenCalledWith("waived_at", null);
  });

  it("coupée : rien d'autre n'est lu", async () => {
    mock = createSupabaseMock({ results: [{ data: { world_id: "w1" } }, { data: { ...MONDE, tax_enabled: false } }] });
    const { result } = renderHook(() => usePersonaTax("p1"));
    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(mock.builders).toHaveLength(2);
  });

  it("payer : la RPC, puis relecture et badge à jour", async () => {
    mock = createSupabaseMock({
      results: [{ data: { world_id: "w1" } }, { data: MONDE }, { data: [DETTE] }, { data: [] }],
    });
    mock.client.rpc.mockResolvedValue({ data: 1, error: null });
    const { result } = renderHook(() => usePersonaTax("p1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    let res: unknown;
    await act(async () => {
      res = await result.current.pay();
    });
    expect(res).toEqual({ ok: true });
    expect(mock.client.rpc).toHaveBeenCalledWith("pay_persona_tax", { p_persona: "p1" });
    expect(result.current.dues).toEqual([]);
    expect(invalidateTaxBadges).toHaveBeenCalledWith("p1");
  });

  it("payer sans le sou : « insufficient »", async () => {
    mock = createSupabaseMock({ results: [{ data: { world_id: "w1" } }, { data: MONDE }, { data: [DETTE] }] });
    mock.client.rpc.mockResolvedValue({ data: null, error: { message: "Solde insuffisant." } });
    const { result } = renderHook(() => usePersonaTax("p1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    await act(async () => {
      expect(await result.current.pay()).toEqual({ ok: false, error: "insufficient" });
    });
  });

  it("annuler : la RPC de qui gère l'économie", async () => {
    mock = createSupabaseMock({
      results: [{ data: { world_id: "w1" } }, { data: MONDE }, { data: [DETTE] }, { data: [] }],
    });
    mock.client.rpc.mockResolvedValue({ data: 1, error: null });
    const { result } = renderHook(() => usePersonaTax("p1"));
    await waitFor(() => expect(result.current.status).toBe("on"));
    await act(async () => {
      expect(await result.current.waive()).toBe(true);
    });
    expect(mock.client.rpc).toHaveBeenCalledWith("waive_persona_tax", { p_persona: "p1" });
  });
});
