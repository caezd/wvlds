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
        { data: null, error: null }, // fetch demande en attente (aucune)
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
    expect(await screen.findByRole("option", { name: "Yuki" })).toBeInTheDocument();
  });

  it("envoie une demande au conjoint choisi au lieu d'écrire directement spouse_persona_id", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: null, error: null }, // update marital_status
        { data: [{ id: "p2", name: "Yuki" }], error: null }, // fetch personas du monde
        { data: null, error: null }, // fetch demande en attente (aucune)
        { data: { id: "req1" }, error: null }, // insert persona_marital_requests
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

    await user.click(spouseTrigger);
    await user.click(await screen.findByRole("option", { name: "Yuki" }));

    await waitFor(() => {
      const requestBuilder = mock.buildersFor("persona_marital_requests")[1];
      expect(requestBuilder.insert).toHaveBeenCalledWith({
        requester_persona_id: "p1",
        target_persona_id: "p2",
        requested_status: "married",
      });
    });

    expect(await screen.findByText(/en attente de confirmation de yuki/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /conjoint/i })).not.toBeInTheDocument();
  });

  it("permet d'annuler une demande en attente", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: null, error: null }, // update marital_status
        { data: [{ id: "p2", name: "Yuki" }], error: null }, // fetch personas du monde
        { data: null, error: null }, // fetch demande en attente (aucune)
        { data: { id: "req1" }, error: null }, // insert persona_marital_requests
        { data: null, error: null }, // delete (annulation)
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
    await user.click(spouseTrigger);
    await user.click(await screen.findByRole("option", { name: "Yuki" }));
    await screen.findByText(/en attente de confirmation de yuki/i);

    await user.click(screen.getByRole("button", { name: /annuler/i }));

    await waitFor(() => {
      const deleteBuilder = mock.buildersFor("persona_marital_requests")[2];
      expect(deleteBuilder.delete).toHaveBeenCalled();
      expect(deleteBuilder.eq).toHaveBeenCalledWith("id", "req1");
    });
    expect(await screen.findByRole("combobox", { name: /conjoint/i })).toBeInTheDocument();
  });
});
