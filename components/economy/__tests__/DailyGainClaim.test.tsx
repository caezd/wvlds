import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import fr from "@/messages/fr.json";
import { createSupabaseMock } from "@/test/supabaseMock";

// jsdom de ce dépôt n'a pas de localStorage complet : un stockage en mémoire.
const stockage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => stockage[k] ?? null,
  setItem: (k: string, v: string) => { stockage[k] = v; },
  removeItem: (k: string) => { delete stockage[k]; },
  clear: () => { for (const k of Object.keys(stockage)) delete stockage[k]; },
});

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DailyGainClaim } from "@/components/economy/DailyGainClaim";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const UNITS = [
  { name: "Or", short: "po", value: 100 },
  { name: "Argent", short: "pa", value: 1 },
];

function setup(total: number) {
  const mock = createSupabaseMock({ results: [] });
  mock.client.rpc.mockResolvedValue({ data: total, error: null });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

function renderClaim(worldId = "w1") {
  return render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      <DailyGainClaim worldId={worldId} currencyUnits={UNITS} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("DailyGainClaim (migration 252)", () => {
  it("la première visite du jour réclame le gain et l'annonce", async () => {
    const mock = setup(450);
    renderClaim();
    await waitFor(() => expect(mock.client.rpc).toHaveBeenCalledWith("claim_daily_gain", { p_world: "w1" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Gain du jour : 4 po 50 pa pour vos personas."));
  });

  it("rien à gagner : pas d'annonce", async () => {
    const mock = setup(0);
    renderClaim();
    await waitFor(() => expect(mock.client.rpc).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("une seule demande par jour et par monde", async () => {
    const mock = setup(3);
    const { unmount } = renderClaim();
    await waitFor(() => expect(mock.client.rpc).toHaveBeenCalledTimes(1));
    unmount();
    renderClaim();
    renderClaim("w2");
    await waitFor(() => expect(mock.client.rpc).toHaveBeenCalledTimes(2));
    expect(mock.client.rpc).toHaveBeenLastCalledWith("claim_daily_gain", { p_world: "w2" });
  });
});
