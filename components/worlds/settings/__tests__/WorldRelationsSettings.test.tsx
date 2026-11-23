import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { WorldRelationsSettings } from "@/components/worlds/settings/WorldRelationsSettings";

const TYPES = [
  { id: "t1", world_id: "w1", name: "Ami·e", color: "#22c55e", dash: "", sort_index: 0, mutual: false, marital_status: null },
  { id: "t2", world_id: "w1", name: "Rival·e", color: "#f97316", dash: "5 3", sort_index: 1, mutual: false, marital_status: null },
  { id: "t3", world_id: "w1", name: "En couple", color: "#ec4899", dash: "", sort_index: 2, mutual: true, marital_status: "in_relationship" },
  { id: "t4", world_id: "w1", name: "Marié·e", color: "#e11d48", dash: "8 4", sort_index: 3, mutual: true, marital_status: "married" },
];

/** La lecture du montage (les types), puis les écritures dans l'ordre. Les
 *  groupes de personas ont leur onglet : WorldGroupsSettings.test.tsx. */
function monter(ecritures: { data?: unknown; error?: unknown }[] = []) {
  const mock = createSupabaseMock({ results: [{ data: TYPES }, ...ecritures] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  render(<WorldRelationsSettings worldId="w1" />);
  return mock;
}

beforeEach(() => vi.clearAllMocks());

describe("WorldRelationsSettings", () => {
  it("les types de relation seuls, avec leur aide et leur compte : les groupes ont leur onglet", async () => {
    const mock = monter();
    expect(await screen.findByRole("heading", { name: /^Relations/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Groupes" })).toBeNull();
    expect(mock.buildersFor("world_persona_groups")).toHaveLength(0);

    const types = screen.getByRole("region", { name: "Types de relation" });
    expect(types).toHaveTextContent("4 types");
    // Le trait tel qu'il paraît sur le graphe.
    expect(within(types).getAllByTestId("relation-line")[1].querySelector("line")).toHaveAttribute("stroke-dasharray", "5 3");
    // Le trait, et la réciprocité : éteinte, ou le statut marital.
    expect(within(types).getByRole("combobox", { name: "Trait de Rival·e" })).toHaveTextContent("Tirets");
    expect(within(types).getByRole("combobox", { name: "Réciprocité de Ami·e" })).toHaveAttribute("data-reciprocity", "none");
    expect(within(types).getByRole("combobox", { name: "Réciprocité de En couple" })).toHaveTextContent("En couple");
    // Un type marital ne se supprime pas.
    expect(within(types).getByRole("button", { name: "Supprimer le type Marié·e" })).toBeDisabled();
    expect(within(types).getByRole("button", { name: "Supprimer le type Ami·e" })).toBeEnabled();
  });

  it("le trait d'un type se choisit dans un sélecteur", async () => {
    const mock = monter([{ data: null }]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("combobox", { name: "Trait de Ami·e" }));
    await user.click(await screen.findByRole("option", { name: "Longs tirets" }));
    expect(mock.buildersFor("world_relation_types").at(-1)!.update).toHaveBeenCalledWith({ dash: "8 4" });
  });

  it("la réciprocité : un statut marital déjà pris est grisé ; « Réciproque » enregistre sans statut", async () => {
    const mock = monter([{ data: null }]);
    const user = userEvent.setup();
    const choix = await screen.findByRole("combobox", { name: "Réciprocité de Ami·e" });
    await user.click(choix);
    expect(await screen.findByRole("option", { name: "Marié·e" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: "En couple" })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("option", { name: "Réciproque" }));
    expect(mock.buildersFor("world_relation_types").at(-1)!.update).toHaveBeenCalledWith({ mutual: true, marital_status: null });
    expect(await screen.findByRole("combobox", { name: "Réciprocité de Ami·e" })).toHaveAttribute("data-reciprocity", "mutual");
  });
});
