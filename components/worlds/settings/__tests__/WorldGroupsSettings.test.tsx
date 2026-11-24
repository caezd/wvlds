import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PLAYER_COLOR } from "@/lib/playerColors";

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
function monter(ecritures: { data?: unknown; error?: unknown }[] = [], groupes: unknown[] = GROUPES) {
  const mock = createSupabaseMock({
    results: [{ data: groupes }, { data: AFFECTATIONS }, { data: PERSONAS }, { data: PROFILS }, ...ecritures],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  render(<WorldGroupsSettings worldId="w1" />);
  return mock;
}

/** Les lignes de groupe, dans l'ordre affiché : [nom, profondeur]. */
function lignes() {
  const liste = screen.getByRole("list", { name: "Groupes" });
  return Array.from(liste.querySelectorAll<HTMLElement>("li[data-group-id]")).map((li) => [
    li.querySelector("[data-group-name]")!.textContent,
    Number(li.getAttribute("data-depth")),
  ]);
}

/** La ligne d'un groupe dans la liste. */
function ligne(nom: string) {
  return screen.getByRole("button", { name: `Gérer le groupe ${nom}` }).closest("li")!;
}

async function ouvrirMenu(user: ReturnType<typeof userEvent.setup>, nom: string) {
  await user.click(await screen.findByRole("button", { name: `Actions du groupe ${nom}` }));
}

/** Ouvre la page d'un groupe depuis sa ligne ; son titre est le chemin du groupe. */
async function ouvrirPage(user: ReturnType<typeof userEvent.setup>, nom: string, titre = nom) {
  await user.click(await screen.findByRole("button", { name: `Gérer le groupe ${nom}` }));
  return screen.findByRole("heading", { level: 3, name: titre });
}

beforeEach(() => vi.clearAllMocks());

describe("WorldGroupsSettings — la liste", () => {
  it("l'arbre : un sous-groupe sous son parent, en retrait ; sa couleur héritée est signalée", async () => {
    monter();
    expect(await screen.findByRole("heading", { level: 3, name: "Groupes" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Groupes de personas" })).toHaveTextContent("3 groupes");
    expect(lignes()).toEqual([["Maison", 0], ["Branche cadette", 1], ["Ordre", 0]]);
    const cadette = ligne("Branche cadette").querySelector("[data-group-swatch]")!;
    expect(cadette).toHaveAttribute("data-inherited");
    expect(cadette).toHaveAttribute("title", "Couleur héritée de « Maison »");
    // La pastille montre la couleur héritée.
    expect(cadette).toHaveStyle({ backgroundColor: "#ff0000" });
  });

  it("chaque ligne ouvre la page du groupe, et donne le nombre de ses membres et l'aperçu de sa description", async () => {
    monter();
    expect(await screen.findByRole("button", { name: "Gérer le groupe Maison" })).toHaveTextContent("2 membres");
    expect(screen.getByRole("button", { name: "Gérer le groupe Maison" })).toHaveTextContent("Les gens de la maison");
    expect(screen.getByRole("button", { name: "Gérer le groupe Branche cadette" })).toHaveTextContent("1 membre");
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
    const cadette = ligne("Branche cadette").querySelector("[data-group-swatch]")!;
    expect(cadette).not.toHaveAttribute("data-inherited");
    expect(cadette).toHaveStyle({ backgroundColor: "#ff0000" });
  });
});

describe("WorldGroupsSettings — création sur la page du groupe", () => {
  it("« Nouveau groupe » ouvre une page vierge ; le groupe créé y montre ensuite ses membres", async () => {
    const mock = monter([{
      data: { id: "g4", name: "Sans-Nom", description: "Les oubliés", color: DEFAULT_PLAYER_COLOR, parent_id: null, sort_index: 2, apply_color: true },
    }]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Nouveau groupe" }));
    expect(await screen.findByRole("heading", { level: 3, name: "Nouveau groupe" })).toBeInTheDocument();
    const creer = screen.getByRole("button", { name: "Créer" });
    expect(creer).toBeDisabled();
    expect(screen.getByRole("switch", { name: /^Appliquer la couleur/ })).toHaveAttribute("data-state", "checked");
    await user.type(screen.getByRole("textbox", { name: "Nom du groupe" }), "Sans-Nom");
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Les oubliés");
    await user.click(creer);
    expect(mock.buildersFor("world_persona_groups").at(-1)!.insert).toHaveBeenCalledWith({
      world_id: "w1", name: "Sans-Nom", description: "Les oubliés", color: DEFAULT_PLAYER_COLOR,
      parent_id: null, sort_index: 2, apply_color: true,
    });
    expect(await screen.findByRole("heading", { level: 3, name: "Sans-Nom" })).toBeInTheDocument();
    expect(screen.getByText("Aucun persona dans ce groupe.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Groupes" }));
    await waitFor(() => expect(lignes()).toEqual([["Maison", 0], ["Branche cadette", 1], ["Ordre", 0], ["Sans-Nom", 0]]));
  });

  it("« Ajouter un sous-groupe » : il hérite de la couleur de son parent et l'applique comme lui", async () => {
    const mock = monter([{
      data: { id: "gardes", name: "Gardes", description: null, color: null, parent_id: "maison", sort_index: 1, apply_color: true },
    }]);
    const user = userEvent.setup();
    await ouvrirMenu(user, "Maison");
    await user.click(await screen.findByRole("menuitem", { name: "Ajouter un sous-groupe" }));
    expect(await screen.findByRole("heading", { level: 3, name: "Nouveau sous-groupe de « Maison »" })).toBeInTheDocument();
    expect(screen.getByText("Couleur héritée de « Maison »")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choisir une couleur" })).toHaveStyle({ backgroundColor: "#ff0000" });
    await user.type(screen.getByRole("textbox", { name: "Nom du groupe" }), "Gardes");
    await user.click(screen.getByRole("button", { name: "Créer" }));
    expect(mock.buildersFor("world_persona_groups").at(-1)!.insert).toHaveBeenCalledWith({
      world_id: "w1", name: "Gardes", description: null, color: null, parent_id: "maison", sort_index: 1, apply_color: true,
    });
    expect(await screen.findByRole("heading", { level: 3, name: "Maison › Gardes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Groupes" }));
    await waitFor(() => expect(lignes()).toEqual([["Maison", 0], ["Branche cadette", 1], ["Gardes", 1], ["Ordre", 0]]));
  });
});

describe("WorldGroupsSettings — page d'un groupe", () => {
  it("le nom se modifie sur la page, et s'enregistre en quittant le champ ; vide, il revient", async () => {
    const mock = monter([{ data: null }]);
    const user = userEvent.setup();
    await ouvrirPage(user, "Ordre");
    const nom = screen.getByRole("textbox", { name: "Nom du groupe" });
    expect(nom).toHaveValue("Ordre");
    await user.clear(nom);
    await user.type(nom, "Ordre des Cendres");
    await user.tab();
    const ecriture = mock.buildersFor("world_persona_groups").at(-1)!;
    expect(ecriture.update).toHaveBeenCalledWith({ name: "Ordre des Cendres" });
    expect(ecriture.eq).toHaveBeenCalledWith("id", "ordre");
    expect(screen.getByRole("heading", { level: 3, name: "Ordre des Cendres" })).toBeInTheDocument();

    const ecritures = mock.buildersFor("world_persona_groups").length;
    await user.clear(nom);
    await user.tab();
    expect(nom).toHaveValue("Ordre des Cendres");
    expect(mock.buildersFor("world_persona_groups")).toHaveLength(ecritures);
  });

  it("« Couleur appliquée » s'enregistre à la bascule ; un échec la rétablit", async () => {
    const mock = monter([{ data: null }, { error: { message: "rls" } }]);
    const user = userEvent.setup();
    await ouvrirPage(user, "Ordre");
    const bascule = screen.getByRole("switch", { name: "Appliquer la couleur de Ordre" });
    expect(bascule).toHaveAttribute("data-state", "unchecked");
    // La couleur et son interrupteur partagent une ligne.
    expect(screen.getByRole("button", { name: "Choisir une couleur" }).closest("[data-group-color]")).toContainElement(bascule);
    await user.click(bascule);
    expect(bascule).toHaveAttribute("data-state", "checked");
    const ecriture = mock.buildersFor("world_persona_groups").at(-1)!;
    expect(ecriture.update).toHaveBeenCalledWith({ apply_color: true });
    expect(ecriture.eq).toHaveBeenCalledWith("id", "ordre");
    await user.click(bascule);
    await waitFor(() => expect(bascule).toHaveAttribute("data-state", "checked"));
    expect(toast.error).toHaveBeenCalledWith("L'enregistrement a échoué");
  });

  it("un sous-groupe qui a sa couleur peut reprendre celle de son parent", async () => {
    const mock = monter([{ data: null }], [GROUPES[0], { ...GROUPES[1], color: "#00ff00" }, GROUPES[2]]);
    const user = userEvent.setup();
    await ouvrirPage(user, "Branche cadette", "Maison › Branche cadette");
    await user.click(screen.getByRole("button", { name: "Reprendre la couleur de « Maison »" }));
    expect(mock.buildersFor("world_persona_groups").at(-1)!.update).toHaveBeenCalledWith({ color: null });
    expect(await screen.findByText("Couleur héritée de « Maison »")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choisir une couleur" })).toHaveStyle({ backgroundColor: "#ff0000" });
  });

  it("la page liste ses membres, leur joueur, et dit quel groupe donne leur couleur", async () => {
    monter();
    const user = userEvent.setup();
    await ouvrirPage(user, "Maison");
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
    await ouvrirPage(user, "Ordre");
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
    await ouvrirPage(user, "Maison");
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
    await ouvrirPage(user, "Maison");
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
