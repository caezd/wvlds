import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockCreateClient(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { RelationsCanvas } from "@/components/worlds/relations/RelationsCanvas";

/**
 * Résultats consommés dans l'ordre des appels `.from()` de `load()` :
 * personas, world_members, worlds(single), world_persona_groups,
 * persona_group_assignments, persona_relations, user_canvas_positions,
 * world_relation_types, puis profiles (hors Promise.all).
 */
function mockSetup() {
  const mock = createSupabaseMock({
    results: [
      { data: [
        { id: "p1", name: "Adhi", avatar_url: null, user_id: "u1" },
        { id: "p2", name: "Astérion", avatar_url: null, user_id: "u2" },
      ] },
      { data: [{ user_id: "u1" }, { user_id: "u2" }] },
      { data: { owner_id: "u1" } },
      { data: [] }, // world_persona_groups
      { data: [] }, // persona_group_assignments
      { data: [
        { id: "r1", from_persona_id: "p1", to_persona_id: "p2", type: "t1", label: null, description: "Amis d'enfance" },
      ] },
      { data: [] }, // user_canvas_positions
      { data: [{ id: "t1", name: "Allié", color: "#22c55e", dash: "", sort_index: 0 }] },
      { data: [
        { id: "u1", username: "alice", avatar_url: null },
        { id: "u2", username: "bob", avatar_url: null },
      ] }, // profiles
    ],
  });
  mockCreateClient.mockReturnValue(mock.client);
  return mock;
}

/**
 * Le canevas desktop reste monté (juste `hidden` en CSS) à côté de la vue
 * mobile — il affiche les mêmes noms de personas. jsdom ne filtre pas par
 * visibilité CSS, donc `screen.getByText` seul verrait deux correspondances ;
 * on scope systématiquement les requêtes au conteneur mobile via ce helper.
 */
function mobile() {
  return within(screen.getByTestId("relations-mobile"));
}

describe("RelationsCanvas — vue mobile (liste + détail)", () => {
  it("affiche les personas groupés par joueur", async () => {
    mockSetup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    expect(await mobile().findByText("Adhi")).toBeInTheDocument();
    expect(mobile().getByText("Astérion")).toBeInTheDocument();
    expect(mobile().getByText("@alice")).toBeInTheDocument();
    expect(mobile().getByText("@bob")).toBeInTheDocument();
  });

  it("taper un persona ouvre le détail avec ses relations groupées par type", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await user.click(await mobile().findByText("Adhi"));

    // Titre du détail + relation sortante vers Astérion, groupée sous "Allié".
    expect(mobile().getByText("Allié")).toBeInTheDocument();
    expect(mobile().getByText("Amis d'enfance")).toBeInTheDocument();
  });

  it("le bouton retour revient à la liste des personas", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await user.click(await mobile().findByText("Adhi"));
    expect(mobile().getByText("Allié")).toBeInTheDocument();

    await user.click(mobile().getByLabelText("Retour"));
    expect(mobile().getByText("Adhi")).toBeInTheDocument();
    expect(mobile().queryByText("Allié")).not.toBeInTheDocument();
  });

  it("le bouton + propose les autres personas comme cible, en excluant soi-même", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await user.click(await mobile().findByText("Adhi"));
    await user.click(mobile().getByLabelText("Ajouter une relation"));

    expect(mobile().getByText("Choisissez la personne visée")).toBeInTheDocument();
    expect(mobile().getByRole("button", { name: /Astérion/ })).toBeInTheDocument();
    // "Adhi" reste affiché dans l'en-tête (contexte de la personne source),
    // mais ne doit PAS apparaître comme option cible sélectionnable.
    expect(mobile().queryByRole("button", { name: /Adhi/ })).not.toBeInTheDocument();
  });

  it("choisir une cible affiche le sélecteur de type de relation", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await user.click(await mobile().findByText("Adhi"));
    await user.click(mobile().getByLabelText("Ajouter une relation"));
    await user.click(mobile().getByText("Astérion"));

    expect(mobile().getByText("Type de relation")).toBeInTheDocument();
    expect(mobile().getByRole("button", { name: "Allié" })).toBeInTheDocument();
  });

  it("n'affiche pas le bouton + pour un persona qui n'appartient pas à l'utilisateur (sans droit admin)", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await user.click(await mobile().findByText("Astérion"));
    expect(mobile().queryByLabelText("Ajouter une relation")).not.toBeInTheDocument();
  });
});

describe("RelationsCanvas — recherche (header)", () => {
  /** L'icône loupe doit être ouverte (transformée en champ) avant de taper. */
  async function openSearch(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByLabelText("Rechercher…"));
    return screen.getByPlaceholderText("Rechercher…");
  }

  it("l'icône loupe seule n'affiche pas de champ de saisie", async () => {
    mockSetup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await mobile().findByText("Adhi");
    expect(screen.queryByPlaceholderText("Rechercher…")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Rechercher…")).toBeInTheDocument();
  });

  it("cliquer la loupe transforme l'icône en champ de saisie, focus inclus", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await mobile().findByText("Adhi");
    const input = await openSearch(user);
    expect(input).toHaveFocus();
  });

  it("filtre la liste mobile par nom de persona", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await mobile().findByText("Adhi");
    await user.type(await openSearch(user), "stéri");

    expect(mobile().getByText("Astérion")).toBeInTheDocument();
    expect(mobile().queryByText("Adhi")).not.toBeInTheDocument();
  });

  it("un pseudo de joueur qui matche garde tous ses personas", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await mobile().findByText("Adhi");
    await user.type(await openSearch(user), "alice");

    expect(mobile().getByText("Adhi")).toBeInTheDocument();
    expect(mobile().queryByText("Astérion")).not.toBeInTheDocument();
  });

  it("affiche un message quand la recherche ne correspond à rien", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await mobile().findByText("Adhi");
    await user.type(await openSearch(user), "zzzzz");

    expect(mobile().getByText("Aucun résultat.")).toBeInTheDocument();
  });

  it("le bouton d'effacement vide la recherche, restaure la liste complète et referme le champ", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await mobile().findByText("Adhi");
    await user.type(await openSearch(user), "stéri");
    expect(mobile().queryByText("Adhi")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Effacer la recherche"));
    expect(mobile().getByText("Adhi")).toBeInTheDocument();
    expect(mobile().getByText("Astérion")).toBeInTheDocument();
    // Repliée en icône, le champ disparaît du DOM.
    expect(screen.queryByPlaceholderText("Rechercher…")).not.toBeInTheDocument();
  });

  it("la touche Échap referme le champ et restaure la liste complète", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await mobile().findByText("Adhi");
    const input = await openSearch(user);
    await user.type(input, "stéri");
    expect(mobile().queryByText("Adhi")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(mobile().getByText("Adhi")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Rechercher…")).not.toBeInTheDocument();
  });
});
