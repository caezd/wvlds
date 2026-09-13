import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

// Désigner un·e conjoint·e est une relation depuis la migration 173 : le
// sélecteur passe par les actions des relations, pas par une table à part.
const actions = vi.hoisted(() => ({
  createPersonaRelation: vi.fn(),
  deletePersonaRelation: vi.fn(),
}));
vi.mock("@/app/actions/personaRelations", () => actions);

import { MaritalStatusPicker } from "@/components/personas/PersonaEditSheet";

// Radix Select repose sur des API de pointeur absentes de jsdom.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
  actions.deletePersonaRelation.mockResolvedValue({ ok: true });
});

/** Les lectures faites quand le sélecteur de conjoint apparaît, dans l'ordre. */
const LECTURES_CONJOINT = [
  { data: [{ id: "p2", name: "Yuki" }], error: null },                                  // personas du monde
  { data: [{ id: "t-married", marital_status: "married" }, { id: "t-couple", marital_status: "in_relationship" }], error: null }, // types maritaux
  { data: null, error: null },                                                          // demande en attente (aucune)
];

function monter(mock: ReturnType<typeof createSupabaseMock>, props: Partial<{ initialStatus: "married" | null; initialSpouseId: string | null }> = {}) {
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  render(
    <MaritalStatusPicker
      personaId="p1"
      supabase={mock.client as never}
      worldId="w1"
      initialStatus={props.initialStatus ?? null}
      initialSpouseId={props.initialSpouseId ?? null}
    />,
  );
}

async function choisirMarie(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: /statut marital/i }));
  await user.click(await screen.findByRole("option", { name: "Marié(e)" }));
  return screen.findByRole("combobox", { name: /conjoint/i });
}

describe("MaritalStatusPicker", () => {
  it("met à jour le statut marital et masque le sélecteur de conjoint pour un statut sans relation", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    monter(mock);
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox", { name: /statut marital/i }));
    await user.click(await screen.findByRole("option", { name: "Célibataire" }));

    await waitFor(() => {
      const builder = mock.buildersFor("personas")[0];
      expect(builder.update).toHaveBeenCalledWith({ marital_status: "single", spouse_persona_id: null });
    });
    expect(screen.queryByRole("combobox", { name: /conjoint/i })).not.toBeInTheDocument();
    expect(actions.deletePersonaRelation).not.toHaveBeenCalled();
  });

  it("affiche le sélecteur de conjoint (personas du monde, hors soi-même) une fois « Marié(e) » choisi", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }, ...LECTURES_CONJOINT] });
    monter(mock);
    const user = userEvent.setup();

    const spouseTrigger = await choisirMarie(user);
    await waitFor(() => expect(mock.buildersFor("personas").length).toBeGreaterThanOrEqual(2));
    const fetchBuilder = mock.buildersFor("personas")[1];
    expect(fetchBuilder.eq).toHaveBeenCalledWith("world_id", "w1");
    expect(fetchBuilder.neq).toHaveBeenCalledWith("id", "p1");

    await user.click(spouseTrigger);
    expect(await screen.findByRole("option", { name: "Yuki" })).toBeInTheDocument();
  });

  it("désigner un conjoint crée une relation du type marital du monde ; en attente, elle s'affiche comme une demande", async () => {
    actions.createPersonaRelation.mockResolvedValue({ ok: true, relation: { id: "r1", status: "pending" } });
    const mock = createSupabaseMock({ results: [{ data: null, error: null }, ...LECTURES_CONJOINT] });
    monter(mock);
    const user = userEvent.setup();

    const spouseTrigger = await choisirMarie(user);
    await waitFor(() => expect(mock.buildersFor("world_relation_types")).toHaveLength(1));
    await user.click(spouseTrigger);
    await user.click(await screen.findByRole("option", { name: "Yuki" }));

    await waitFor(() => expect(actions.createPersonaRelation).toHaveBeenCalledWith({
      worldId: "w1", fromPersonaId: "p1", toPersonaId: "p2", typeId: "t-married",
    }));
    expect(await screen.findByText(/en attente de confirmation de yuki/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /conjoint/i })).not.toBeInTheDocument();
  });

  it("acceptée d'emblée (persona à soi), la relation pose le conjoint sans attente", async () => {
    actions.createPersonaRelation.mockResolvedValue({ ok: true, relation: { id: "r1", status: "accepted" } });
    const mock = createSupabaseMock({ results: [{ data: null, error: null }, ...LECTURES_CONJOINT] });
    monter(mock);
    const user = userEvent.setup();

    const spouseTrigger = await choisirMarie(user);
    await waitFor(() => expect(mock.buildersFor("world_relation_types")).toHaveLength(1));
    await user.click(spouseTrigger);
    await user.click(await screen.findByRole("option", { name: "Yuki" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByText(/en attente/i)).toBeNull();
    expect(screen.getByRole("combobox", { name: /conjoint/i })).toHaveTextContent("Yuki");
  });

  it("permet d'annuler une demande en attente", async () => {
    actions.createPersonaRelation.mockResolvedValue({ ok: true, relation: { id: "r1", status: "pending" } });
    const mock = createSupabaseMock({ results: [{ data: null, error: null }, ...LECTURES_CONJOINT] });
    monter(mock);
    const user = userEvent.setup();

    const spouseTrigger = await choisirMarie(user);
    await waitFor(() => expect(mock.buildersFor("world_relation_types")).toHaveLength(1));
    await user.click(spouseTrigger);
    await user.click(await screen.findByRole("option", { name: "Yuki" }));
    await screen.findByText(/en attente de confirmation de yuki/i);

    await user.click(screen.getByRole("button", { name: /annuler/i }));

    await waitFor(() => expect(actions.deletePersonaRelation).toHaveBeenCalledWith("r1"));
    expect(await screen.findByRole("combobox", { name: /conjoint/i })).toBeInTheDocument();
  });

  it("passer à un statut sans conjoint rompt d'abord la relation, puis écrit le statut", async () => {
    const mock = createSupabaseMock({ results: [
      ...LECTURES_CONJOINT,                      // le sélecteur de conjoint est visible d'emblée
      { data: { id: "r-couple" }, error: null }, // la relation acceptée vers le conjoint
      { data: null, error: null },               // update marital_status
    ] });
    monter(mock, { initialStatus: "married", initialSpouseId: "p2" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox", { name: /statut marital/i }));
    await user.click(await screen.findByRole("option", { name: "Veuf(ve)" }));

    await waitFor(() => expect(actions.deletePersonaRelation).toHaveBeenCalledWith("r-couple"));
    await waitFor(() => expect(mock.buildersFor("personas").at(-1)!.update)
      .toHaveBeenCalledWith({ marital_status: "widowed", spouse_persona_id: null }));
  });

  it("si la rupture échoue, le statut n'est pas écrit par-dessus le couple", async () => {
    actions.deletePersonaRelation.mockResolvedValue({ ok: false, error: "forbidden" });
    const mock = createSupabaseMock({ results: [...LECTURES_CONJOINT, { data: { id: "r-couple" }, error: null }] });
    monter(mock, { initialStatus: "married", initialSpouseId: "p2" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox", { name: /statut marital/i }));
    await user.click(await screen.findByRole("option", { name: "Célibataire" }));

    await waitFor(() => expect(actions.deletePersonaRelation).toHaveBeenCalled());
    expect(mock.buildersFor("personas").some((b) => b.update.mock.calls.length > 0)).toBe(false);
    expect(screen.getByRole("combobox", { name: /statut marital/i })).toHaveTextContent("Marié(e)");
  });
});
