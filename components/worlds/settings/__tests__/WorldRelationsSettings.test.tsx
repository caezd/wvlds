import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { WorldRelationsSettings } from "@/components/worlds/settings/WorldRelationsSettings";

const GROUPES = [
  { id: "g1", name: "Maison Veldis", color: "#6366f1", sort_index: 0 },
  { id: "g2", name: "Ordre des Cendres", color: "#ef4444", sort_index: 1 },
];
const TYPES = [
  { id: "t1", world_id: "w1", name: "Ami·e", color: "#22c55e", dash: "", sort_index: 0, mutual: false, marital_status: null },
  { id: "t2", world_id: "w1", name: "Rival·e", color: "#f97316", dash: "5 3", sort_index: 1, mutual: false, marital_status: null },
  { id: "t3", world_id: "w1", name: "En couple", color: "#ec4899", dash: "", sort_index: 2, mutual: true, marital_status: "in_relationship" },
  { id: "t4", world_id: "w1", name: "Marié·e", color: "#e11d48", dash: "8 4", sort_index: 3, mutual: true, marital_status: "married" },
];

/** Les deux lectures du montage, puis les écritures dans l'ordre. */
function monter(ecritures: { data?: unknown; error?: unknown }[] = []) {
  const mock = createSupabaseMock({ results: [{ data: GROUPES }, { data: TYPES }, ...ecritures] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  render(<WorldRelationsSettings worldId="w1" />);
  return mock;
}

beforeEach(() => vi.clearAllMocks());

describe("WorldRelationsSettings", () => {
  it("deux sections, chacune avec son aide et son compte ; une ligne par groupe et par type", async () => {
    monter();
    expect(await screen.findByRole("heading", { name: /^Relations/ })).toBeInTheDocument();
    const groupes = screen.getByRole("region", { name: "Groupes" });
    expect(groupes).toHaveTextContent("2 groupes");
    expect(within(groupes).getByRole("button", { name: "Aide : Groupes" })).toBeInTheDocument();
    expect(within(groupes).getAllByRole("textbox", { name: "Nom du groupe" }).map((i) => (i as HTMLInputElement).value))
      .toEqual(["Maison Veldis", "Ordre des Cendres"]);

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

  it("un groupe se renomme sur place, et s'enregistre en quittant le champ", async () => {
    const mock = monter([{ data: null }]);
    const user = userEvent.setup();
    const [nom] = await screen.findAllByRole("textbox", { name: "Nom du groupe" });
    await user.clear(nom);
    await user.type(nom, "Maison Veldis-Orr");
    await user.tab();
    const ecriture = mock.buildersFor("world_persona_groups").at(-1)!;
    expect(ecriture.update).toHaveBeenCalledWith({ name: "Maison Veldis-Orr" });
    expect(ecriture.eq).toHaveBeenCalledWith("id", "g1");
  });

  it("ajouter un groupe : la ligne en pointillés, puis « Ajouter »", async () => {
    const mock = monter([{ data: { id: "g3", name: "Les Sans-Nom", color: "#6366f1", sort_index: 2 } }]);
    const user = userEvent.setup();
    const ajout = await screen.findByRole("button", { name: "Ajouter ce groupe" });
    expect(ajout).toBeDisabled();
    expect(ajout).toHaveTextContent("Ajouter");
    await user.type(screen.getByRole("textbox", { name: "Nom du groupe…" }), "Les Sans-Nom");
    await user.click(ajout);
    expect(mock.buildersFor("world_persona_groups").at(-1)!.insert).toHaveBeenCalledWith({
      world_id: "w1", name: "Les Sans-Nom", color: "#6366f1", sort_index: 2,
    });
    expect(await screen.findByDisplayValue("Les Sans-Nom")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Groupes" })).toHaveTextContent("3 groupes");
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
