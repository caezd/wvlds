import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { setWorldTax } from "@/app/actions/worldTax";
import { createClient } from "@/lib/supabase/server";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

describe("setWorldTax (migration 255)", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const tax = {
    tax_enabled: true,
    tax_amount: 100,
    tax_every: 2,
    tax_unit: "week" as const,
    tax_anchor: "2026-11-01T04:00:00.000Z",
    tax_mode: "auto" as const,
    tax_accumulate: false,
    tax_grace_new: true,
    tax_badge_label: "Impayé",
  };

  it("enregistre les réglages sur le monde", async () => {
    const mock = createSupabaseMock({ results: [{ error: null }] });
    use(mock);
    expect(await setWorldTax(id, tax)).toEqual({ ok: true });
    expect(mock.builders[0].table).toBe("worlds");
    expect(mock.builders[0].builder.update).toHaveBeenCalledWith(tax);
    expect(mock.builders[0].builder.eq).toHaveBeenCalledWith("id", id);
  });

  it("refuse des réglages hors bornes sans rien écrire", async () => {
    const mock = createSupabaseMock();
    use(mock);
    const res = await setWorldTax(id, { ...tax, tax_every: 0 });
    expect(res.ok).toBe(false);
    expect(mock.builders).toHaveLength(0);
  });

  it("un refus de la base devient une erreur", async () => {
    const mock = createSupabaseMock({ results: [{ error: { message: "rls" } }] });
    use(mock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await setWorldTax(id, tax)).ok).toBe(false);
  });
});
