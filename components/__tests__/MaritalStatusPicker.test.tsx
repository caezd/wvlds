import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { MaritalStatusPicker } from "@/components/personas/PersonaEditSheet";

// Radix Select repose sur des API de pointeur absentes de jsdom.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MaritalStatusPicker", () => {
  it("met à jour le statut marital et masque le sélecteur de conjoint pour un statut sans relation", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();

    render(
      <MaritalStatusPicker
        personaId="p1"
        supabase={mock.client as never}
        worldId="w1"
        initialStatus={null}
        initialSpouseId={null}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: /statut marital/i }));
    await user.click(await screen.findByRole("option", { name: "Célibataire" }));

    await waitFor(() => {
      const builder = mock.buildersFor("personas")[0];
      expect(builder.update).toHaveBeenCalledWith({ marital_status: "single", spouse_persona_id: null });
    });
    expect(screen.queryByRole("combobox", { name: /conjoint/i })).not.toBeInTheDocument();
  });

  it("affiche le sélecteur de conjoint (personas du monde, hors soi-même) une fois « Marié(e) » choisi", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: null, error: null }, // update marital_status
        { data: [{ id: "p2", name: "Yuki" }], error: null }, // fetch personas du monde
        { data: null, error: null }, // update spouse_persona_id
      ],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();

    render(
      <MaritalStatusPicker
        personaId="p1"
        supabase={mock.client as never}
        worldId="w1"
        initialStatus={null}
        initialSpouseId={null}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: /statut marital/i }));
    await user.click(await screen.findByRole("option", { name: "Marié(e)" }));

    const spouseTrigger = await screen.findByRole("combobox", { name: /conjoint/i });
    await waitFor(() => {
      expect(mock.buildersFor("personas").length).toBeGreaterThanOrEqual(2);
    });
    const fetchBuilder = mock.buildersFor("personas")[1];
    expect(fetchBuilder.eq).toHaveBeenCalledWith("world_id", "w1");
    expect(fetchBuilder.neq).toHaveBeenCalledWith("id", "p1");

    await user.click(spouseTrigger);
    await user.click(await screen.findByRole("option", { name: "Yuki" }));

    await waitFor(() => {
      const updateBuilder = mock.buildersFor("personas")[2];
      expect(updateBuilder.update).toHaveBeenCalledWith({ spouse_persona_id: "p2" });
    });
  });
});
