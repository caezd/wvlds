import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { WorldGroupsSettings } from "@/components/worlds/settings/WorldGroupsSettings";

// Maison (rouge) › Branche cadette (hérite) ; Ordre (bleu) à la racine.
const GROUPES = [
  { id: "maison", name: "Maison", color: "#ff0000", parent_id: null, sort_index: 0, apply_color: true },
  { id: "cadette", name: "Branche cadette", color: null, parent_id: "maison", sort_index: 0, apply_color: true },
  { id: "ordre", name: "Ordre", color: "#0000ff", parent_id: null, sort_index: 1, apply_color: false },
];

/** La lecture du montage, puis les écritures dans l'ordre. */
function monter(ecritures: { data?: unknown; error?: unknown }[] = []) {
  const mock = createSupabaseMock({ results: [{ data: GROUPES }, ...ecritures] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  render(<WorldGroupsSettings worldId="w1" />);
  return mock;
}

/** Les lignes de groupe, dans l'ordre affiché : [nom, profondeur]. */
function lignes() {
  const liste = screen.getByRole("list", { name: "Groupes" });
  return within(liste).getAllByRole("textbox", { name: "Nom du groupe" }).map((input) => {
    const li = input.closest("li")!;
    return [(input as HTMLInputElement).value, Number(li.getAttribute("data-depth"))];
  });
}

async function ouvrirMenu(user: ReturnType<typeof userEvent.setup>, nom: string) {
  await user.click(await screen.findByRole("button", { name: `Actions du groupe ${nom}` }));
}

beforeEach(() => vi.clearAllMocks());

describe("WorldGroupsSettings", () => {
  it("l'arbre : un sous-groupe sous son parent, en retrait ; sa couleur héritée est signalée", async () => {
    monter();
    expect(await screen.findByRole("heading", { level: 3, name: "Groupes" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Groupes de personas" })).toHaveTextContent("3 groupes");
    expect(lignes()).toEqual([["Maison", 0], ["Branche cadette", 1], ["Ordre", 0]]);
    const cadette = screen.getByDisplayValue("Branche cadette").closest("li")!;
    expect(cadette.querySelector("[data-inherited]")).toHaveAttribute("title", "Couleur héritée de « Maison »");
    // La pastille montre la couleur héritée.
    expect(within(cadette).getByRole("button", { name: "Choisir une couleur" })).toHaveStyle({ backgroundColor: "#ff0000" });
  });

  it("« Couleur appliquée » : un interrupteur par groupe, enregistré à la bascule", async () => {
    const mock = monter([{ data: null }]);
    const user = userEvent.setup();
    const ordre = await screen.findByRole("switch", { name: "Appliquer la couleur de Ordre" });
    expect(ordre).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByRole("switch", { name: "Appliquer la couleur de Maison" })).toHaveAttribute("data-state", "checked");
    await user.click(ordre);
    expect(ordre).toHaveAttribute("data-state", "checked");
    const ecriture = mock.buildersFor("world_persona_groups").at(-1)!;
    expect(ecriture.update).toHaveBeenCalledWith({ apply_color: true });
    expect(ecriture.eq).toHaveBeenCalledWith("id", "ordre");
  });

  it("un échec d'enregistrement rétablit l'interrupteur", async () => {
    monter([{ error: { message: "rls" } }]);
    const user = userEvent.setup();
    const maison = await screen.findByRole("switch", { name: "Appliquer la couleur de Maison" });
    await user.click(maison);
    await waitFor(() => expect(maison).toHaveAttribute("data-state", "checked"));
    expect(toast.error).toHaveBeenCalledWith("L'enregistrement a échoué");
  });

  it("ajouter un sous-groupe : sans couleur propre, il hérite de son parent et l'applique comme lui", async () => {
    const mock = monter([{
      data: { id: "gardes", name: "Gardes", color: null, parent_id: "maison", sort_index: 1, apply_color: true },
    }]);
    const user = userEvent.setup();
    await ouvrirMenu(user, "Maison");
    await user.click(await screen.findByRole("menuitem", { name: "Ajouter un sous-groupe" }));
    const champ = await screen.findByRole("textbox", { name: "Nom du sous-groupe…" });
    // La ligne d'ajout se pose après toute la descendance du parent.
    expect(champ.closest("li")!.previousElementSibling).toHaveAttribute("data-group-id", "cadette");
    await user.type(champ, "Gardes");
    await user.click(screen.getByRole("button", { name: "Ajouter ce sous-groupe à Maison" }));
    expect(mock.buildersFor("world_persona_groups").at(-1)!.insert).toHaveBeenCalledWith({
      world_id: "w1", name: "Gardes", color: null, parent_id: "maison", sort_index: 1, apply_color: true,
    });
    await waitFor(() => expect(lignes()).toEqual([["Maison", 0], ["Branche cadette", 1], ["Gardes", 1], ["Ordre", 0]]));
    expect(screen.queryByRole("textbox", { name: "Nom du sous-groupe…" })).toBeNull();
  });

  it("ajouter un groupe à la racine : la ligne en pointillés", async () => {
    const mock = monter([{
      data: { id: "g4", name: "Sans-Nom", color: "#818CF8", parent_id: null, sort_index: 2, apply_color: true },
    }]);
    const user = userEvent.setup();
    const ajout = await screen.findByRole("button", { name: "Ajouter ce groupe" });
    expect(ajout).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Nom du groupe…" }), "Sans-Nom");
    await user.click(ajout);
    expect(mock.buildersFor("world_persona_groups").at(-1)!.insert).toHaveBeenCalledWith(
      expect.objectContaining({ world_id: "w1", name: "Sans-Nom", parent_id: null, sort_index: 2, apply_color: true }),
    );
    expect(await screen.findByDisplayValue("Sans-Nom")).toBeInTheDocument();
  });

  it("monter d'un cran : le nouvel ordre part en une requête", async () => {
    const mock = monter();
    mock.rpc.mockResolvedValueOnce({ data: 2, error: null });
    const user = userEvent.setup();
    await ouvrirMenu(user, "Ordre");
    await user.click(await screen.findByRole("menuitem", { name: "Monter" }));
    expect(mock.rpc).toHaveBeenCalledWith("reorder_world_persona_groups", {
      p_items: [
        { id: "ordre", parent_id: null, sort_index: 0 },
        { id: "maison", parent_id: null, sort_index: 1 },
      ],
    });
    await waitFor(() => expect(lignes()).toEqual([["Ordre", 0], ["Maison", 0], ["Branche cadette", 1]]));
  });

  it("entrer dans le groupe au-dessus ; une écriture refusée remet l'arbre en place", async () => {
    const mock = monter();
    // La RLS ne lève pas d'erreur : aucune ligne touchée.
    mock.rpc.mockResolvedValueOnce({ data: 0, error: null });
    const user = userEvent.setup();
    await ouvrirMenu(user, "Ordre");
    // Le premier niveau n'a pas de parent d'où sortir.
    expect(screen.queryByRole("menuitem", { name: /^Sortir/ })).toBeNull();
    await user.click(await screen.findByRole("menuitem", { name: "Entrer dans « Maison »" }));
    expect(mock.rpc).toHaveBeenCalledWith("reorder_world_persona_groups", {
      p_items: [{ id: "ordre", parent_id: "maison", sort_index: 1 }],
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("L'enregistrement a échoué"));
    expect(lignes()).toEqual([["Maison", 0], ["Branche cadette", 1], ["Ordre", 0]]);
  });

  it("sortir d'un groupe : le sous-groupe se pose juste après son ancien parent", async () => {
    const mock = monter();
    mock.rpc.mockResolvedValueOnce({ data: 2, error: null });
    const user = userEvent.setup();
    await ouvrirMenu(user, "Branche cadette");
    await user.click(await screen.findByRole("menuitem", { name: "Sortir de « Maison »" }));
    await waitFor(() => expect(lignes()).toEqual([["Maison", 0], ["Branche cadette", 0], ["Ordre", 0]]));
  });

  it("supprimer un groupe : ses sous-groupes remontent d'un niveau et gardent leur couleur", async () => {
    const mock = monter([{ data: null }]);
    const user = userEvent.setup();
    await ouvrirMenu(user, "Maison");
    await user.click(await screen.findByRole("menuitem", { name: "Supprimer le groupe Maison" }));
    const ecriture = mock.buildersFor("world_persona_groups").at(-1)!;
    expect(ecriture.delete).toHaveBeenCalled();
    expect(ecriture.eq).toHaveBeenCalledWith("id", "maison");
    await waitFor(() => expect(lignes()).toEqual([["Branche cadette", 0], ["Ordre", 0]]));
    const cadette = screen.getByDisplayValue("Branche cadette").closest("li")!;
    expect(cadette.querySelector("[data-inherited]")).toBeNull();
    expect(within(cadette).getByRole("button", { name: "Choisir une couleur" })).toHaveStyle({ backgroundColor: "#ff0000" });
  });

  it("un sous-groupe qui a sa couleur peut reprendre celle de son parent", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: [GROUPES[0], { ...GROUPES[1], color: "#00ff00" }, GROUPES[2]] },
        { data: null },
      ],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    render(<WorldGroupsSettings worldId="w1" />);
    const user = userEvent.setup();
    // Un groupe racine n'a pas de parent dont hériter.
    await ouvrirMenu(user, "Maison");
    expect(screen.queryByRole("menuitem", { name: /^Reprendre la couleur/ })).toBeNull();
    await user.keyboard("{Escape}");
    await ouvrirMenu(user, "Branche cadette");
    await user.click(await screen.findByRole("menuitem", { name: "Reprendre la couleur de « Maison »" }));
    expect(mock.buildersFor("world_persona_groups").at(-1)!.update).toHaveBeenCalledWith({ color: null });
    await waitFor(() =>
      expect(screen.getByDisplayValue("Branche cadette").closest("li")!.querySelector("[data-inherited]")).not.toBeNull(),
    );
  });

  it("un groupe se renomme sur place, et s'enregistre en quittant le champ", async () => {
    const mock = monter([{ data: null }]);
    const user = userEvent.setup();
    const nom = await screen.findByDisplayValue("Ordre");
    await user.clear(nom);
    await user.type(nom, "Ordre des Cendres");
    await user.tab();
    const ecriture = mock.buildersFor("world_persona_groups").at(-1)!;
    expect(ecriture.update).toHaveBeenCalledWith({ name: "Ordre des Cendres" });
    expect(ecriture.eq).toHaveBeenCalledWith("id", "ordre");
  });
});
