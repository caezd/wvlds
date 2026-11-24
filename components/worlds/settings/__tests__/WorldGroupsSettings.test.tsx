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
  { id: "maison", name: "Maison", description: "Les gens de la maison", color: "#ff0000", parent_id: null, sort_index: 0, apply_color: true },
  { id: "cadette", name: "Branche cadette", description: null, color: null, parent_id: "maison", sort_index: 0, apply_color: true },
  { id: "ordre", name: "Ordre", description: null, color: "#0000ff", parent_id: null, sort_index: 1, apply_color: false },
];

const PERSONAS = [
  { id: "p1", name: "Kael", avatar_url: null, user_id: "u1", is_npc: false },
  { id: "p2", name: "Lysa", avatar_url: null, user_id: "u2", is_npc: false },
  { id: "p3", name: "Aubergiste", avatar_url: null, user_id: "u1", is_npc: true },
  { id: "p4", name: "Mira", avatar_url: null, user_id: "u2", is_npc: false },
];
// Kael et Lysa dans Maison (Lysa a Ordre pour groupe principal), Mira dans la branche cadette.
const AFFECTATIONS = [
  { persona_id: "p1", group_id: "maison", is_primary: true },
  { persona_id: "p2", group_id: "maison", is_primary: false },
  { persona_id: "p2", group_id: "ordre", is_primary: true },
  { persona_id: "p4", group_id: "cadette", is_primary: true },
];
const PROFILS = [{ id: "u1", username: "alice" }, { id: "u2", username: "bob" }];

/** Les lectures du montage (groupes, affectations, personas, joueurs), puis les écritures dans l'ordre. */
function monter(ecritures: { data?: unknown; error?: unknown }[] = []) {
  const mock = createSupabaseMock({
    results: [{ data: GROUPES }, { data: AFFECTATIONS }, { data: PERSONAS }, { data: PROFILS }, ...ecritures],
  });
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
    await user.click(await screen.findByRole("menuitem", { name: "Supprimer le groupe" }));
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
        { data: [] }, { data: [] },
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

describe("WorldGroupsSettings — fiche d'un groupe", () => {
  /** Ouvre la fiche d'un groupe depuis le nombre de ses membres. */
  async function ouvrirFiche(user: ReturnType<typeof userEvent.setup>, nom: string) {
    await user.click(await screen.findByRole("button", { name: `Gérer le groupe ${nom}` }));
    return screen.findByRole("heading", { level: 3, name: nom });
  }

  it("chaque ligne donne le nombre de ses membres et l'aperçu de sa description", async () => {
    monter();
    expect(await screen.findByRole("button", { name: "Gérer le groupe Maison" })).toHaveTextContent("2 membres");
    expect(screen.getByRole("button", { name: "Gérer le groupe Branche cadette" })).toHaveTextContent("1 membre");
    expect(screen.getByDisplayValue("Maison").closest("li")).toHaveTextContent("Les gens de la maison");
  });

  it("la fiche liste ses membres, leur joueur, et dit quel groupe donne leur couleur", async () => {
    monter();
    const user = userEvent.setup();
    await ouvrirFiche(user, "Maison");
    const membres = within(screen.getByRole("list", { name: "Membres" }));
    expect(membres.getAllByRole("listitem").map((li) => li.querySelector("[data-member-name]")!.textContent)).toEqual(["Kael", "Lysa"]);
    const kael = membres.getByText("Kael").closest("li")!;
    expect(kael).toHaveTextContent("@alice");
    expect(within(kael).getByText("Principal")).toBeInTheDocument();
    const lysa = membres.getByText("Lysa").closest("li")!;
    expect(lysa).toHaveTextContent("Groupe principal : Ordre");
    // Le retour à la liste.
    await user.click(screen.getByRole("button", { name: "Groupes" }));
    expect(await screen.findByRole("list", { name: "Groupes" })).toBeInTheDocument();
  });

  it("la description s'enregistre en quittant le champ ; vide, elle s'efface", async () => {
    const mock = monter([{ data: null }, { data: null }]);
    const user = userEvent.setup();
    await ouvrirFiche(user, "Ordre");
    const champ = screen.getByRole("textbox", { name: "Description" });
    await user.type(champ, "  Les gardiens du feu ");
    await user.tab();
    let ecriture = mock.buildersFor("world_persona_groups").at(-1)!;
    expect(ecriture.update).toHaveBeenCalledWith({ description: "Les gardiens du feu" });
    expect(ecriture.eq).toHaveBeenCalledWith("id", "ordre");
    await user.clear(champ);
    await user.tab();
    ecriture = mock.buildersFor("world_persona_groups").at(-1)!;
    expect(ecriture.update).toHaveBeenCalledWith({ description: null });
  });

  it("ajoute plusieurs personas d'un coup, choisis parmi ceux qui n'en sont pas", async () => {
    const mock = monter([
      {},
      { data: [...AFFECTATIONS, { persona_id: "p3", group_id: "maison", is_primary: true }, { persona_id: "p4", group_id: "maison", is_primary: false }] },
    ]);
    const user = userEvent.setup();
    await ouvrirFiche(user, "Maison");
    const choix = within(screen.getByRole("list", { name: "Ajouter des personas" }));
    // Les membres n'y figurent pas.
    expect(choix.queryByRole("button", { name: /Kael/ })).toBeNull();
    // La recherche porte aussi sur le joueur.
    await user.type(screen.getByRole("textbox", { name: "Persona ou joueur…" }), "bob");
    expect(choix.getAllByRole("button").map((b) => b.textContent)).toEqual([expect.stringContaining("Mira")]);
    await user.click(choix.getByRole("button", { name: /Mira/ }));
    await user.clear(screen.getByRole("textbox", { name: "Persona ou joueur…" }));
    await user.click(choix.getByRole("button", { name: /Aubergiste/ }));
    expect(choix.getByRole("button", { name: /Aubergiste/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Ajouter 2 personas" }));
    expect(mock.buildersFor("persona_group_assignments")[1].upsert).toHaveBeenCalledWith(
      [
        { persona_id: "p4", world_id: "w1", group_id: "maison" },
        { persona_id: "p3", world_id: "w1", group_id: "maison" },
      ],
      { onConflict: "persona_id,group_id", ignoreDuplicates: true },
    );
    const membres = within(screen.getByRole("list", { name: "Membres" }));
    await waitFor(() => expect(membres.getAllByRole("listitem")).toHaveLength(4));
    expect(screen.queryByRole("button", { name: /^Ajouter \d/ })).toBeNull();
  });

  it("un membre devient principal ici, ou quitte le groupe", async () => {
    const mock = monter([
      { data: [{ group_id: "maison" }] },
      { data: AFFECTATIONS.map((a) => (a.persona_id === "p2" ? { ...a, is_primary: a.group_id === "maison" } : a)) },
      {},
      { data: AFFECTATIONS.filter((a) => a.persona_id !== "p1") },
    ]);
    const user = userEvent.setup();
    await ouvrirFiche(user, "Maison");
    await user.click(screen.getByRole("button", { name: "En faire le groupe principal de Lysa" }));
    const principal = mock.buildersFor("persona_group_assignments")[1];
    expect(principal.update).toHaveBeenCalledWith({ is_primary: true });
    expect(principal.eq).toHaveBeenCalledWith("persona_id", "p2");
    expect(principal.eq).toHaveBeenCalledWith("group_id", "maison");
    const membres = within(screen.getByRole("list", { name: "Membres" }));
    await waitFor(() => expect(within(membres.getByText("Lysa").closest("li")!).getByText("Principal")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Retirer Kael du groupe" }));
    const retrait = mock.buildersFor("persona_group_assignments")[3];
    expect(retrait.delete).toHaveBeenCalled();
    expect(retrait.eq).toHaveBeenCalledWith("persona_id", "p1");
    await waitFor(() => expect(membres.queryByText("Kael")).toBeNull());
  });
});
