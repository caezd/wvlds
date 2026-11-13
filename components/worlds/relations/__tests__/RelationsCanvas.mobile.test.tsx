import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockCreateClient(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// `?persona=` présélectionne : le test le règle avant de monter.
const searchParams = vi.hoisted(() => ({ persona: null as string | null }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k: string) => (k === "persona" ? searchParams.persona : null) }),
}));

const actions = vi.hoisted(() => ({
  createPersonaRelation: vi.fn(),
  updatePersonaRelation: vi.fn(),
  deletePersonaRelation: vi.fn(),
  acceptPersonaRelation: vi.fn(),
}));
vi.mock("@/app/actions/personaRelations", () => actions);

import { RelationsCanvas } from "@/components/worlds/relations/RelationsCanvas";

const TYPES = [
  { id: "t1", name: "Allié", color: "#22c55e", dash: "", sort_index: 0, mutual: false, marital_status: null },
  { id: "t-couple", name: "En couple", color: "#ec4899", dash: "", sort_index: 1, mutual: true, marital_status: "in_relationship" },
];

/**
 * Résultats consommés dans l'ordre des appels `.from()` de `load()` :
 * personas, world_members, worlds(single), world_persona_groups,
 * persona_group_assignments, persona_relations, world_relation_types, puis
 * profiles (hors Promise.all).
 */
function mockSetup(relations: object[] = [
  { id: "r1", from_persona_id: "p1", to_persona_id: "p2", type: "t1", label: null, description: "Amis d'enfance", status: "accepted" },
]) {
  const mock = createSupabaseMock({
    results: [
      { data: [
        { id: "p1", name: "Adhi", avatar_url: null, user_id: "u1" },
        { id: "p2", name: "Astérion", avatar_url: null, user_id: "u2" },
      ] },
      { data: [{ user_id: "u1" }, { user_id: "u2" }] },
      { data: { owner_id: "u1" } },
      { data: [{ id: "g1", name: "Garde", color: "#3b82f6", sort_index: 0 }] },
      { data: [{ persona_id: "p2", group_id: "g1" }] },
      { data: relations },
      { data: TYPES },
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

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.persona = null;
});

describe("RelationsCanvas — vue mobile (liste + détail)", () => {
  it("affiche les personas groupés par joueur, avec leur nombre de relations", async () => {
    mockSetup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    expect(await mobile().findByText("Adhi")).toBeInTheDocument();
    expect(mobile().getByText("Astérion")).toBeInTheDocument();
    expect(mobile().getByText("@alice")).toBeInTheDocument();
    expect(mobile().getByText("@bob")).toBeInTheDocument();
    // Les cartes, groupées par joueur, dans une rangée horizontale chacune.
    expect(mobile().getByRole("region", { name: "@alice" })).toBeInTheDocument();
    expect(mobile().getByRole("region", { name: "@bob" })).toBeInTheDocument();
    expect(mobile().getByRole("button", { name: "Adhi" })).toHaveClass("snap-start");
    // Le mock next-intl ne lit pas les pluriels ICU : seul le nombre est sûr.
    expect(mobile().getAllByTitle(/^1 /)).toHaveLength(2);
  });

  it("taper un persona ouvre le détail avec ses relations groupées par type", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await user.click(await mobile().findByText("Adhi"));

    expect(mobile().getByRole("heading", { name: /Allié/ })).toBeInTheDocument();
    expect(mobile().getByText("Amis d'enfance")).toBeInTheDocument();
  });

  it("le bouton retour revient à la liste des personas", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await user.click(await mobile().findByText("Adhi"));
    expect(mobile().getByRole("heading", { name: /Allié/ })).toBeInTheDocument();

    await user.click(mobile().getByLabelText("Retour"));
    expect(mobile().getByText("Adhi")).toBeInTheDocument();
    expect(mobile().queryByRole("heading", { name: /Allié/ })).not.toBeInTheDocument();
  });

  it("le bouton + ouvre le dialogue : cibles hors soi-même, type, puis l'action de création", async () => {
    actions.createPersonaRelation.mockResolvedValue({
      ok: true,
      relation: { id: "r2", world_id: "w1", from_persona_id: "p1", to_persona_id: "p2", type: "t1", label: null, description: "Camarades", status: "accepted" },
    });
    mockSetup([]);
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await user.click(await mobile().findByText("Adhi"));
    await user.click(mobile().getByLabelText("Ajouter une relation"));

    const dialog = await screen.findByRole("dialog", { name: "Nouvelle relation depuis Adhi" });
    // Adhi est le persona de départ : pas une cible.
    expect(within(dialog).getByRole("option", { name: /Astérion/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("option", { name: /Adhi/ })).toBeNull();

    await user.click(within(dialog).getByRole("option", { name: /Astérion/ }));
    await user.click(within(dialog).getByRole("radio", { name: /Allié/ }));
    await user.type(within(dialog).getByLabelText("Description (optionnelle, markdown)…"), "Camarades");
    await user.click(within(dialog).getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(actions.createPersonaRelation).toHaveBeenCalledWith({
      worldId: "w1", fromPersonaId: "p1", toPersonaId: "p2", typeId: "t1", description: "Camarades",
    }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mobile().getByText("Camarades")).toBeInTheDocument();
  });

  it("un type réciproque vers le persona d'un autre joueur annonce une demande", async () => {
    mockSetup([]);
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await user.click(await mobile().findByText("Adhi"));
    await user.click(mobile().getByLabelText("Ajouter une relation"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("option", { name: /Astérion/ }));
    await user.click(within(dialog).getByRole("radio", { name: /En couple/ }));

    expect(within(dialog).getByText(/Astérion devra accepter/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Envoyer la demande" })).toBeInTheDocument();
  });

  it("n'affiche pas le bouton + pour un persona qui n'appartient pas à l'utilisateur (sans droit admin)", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    await user.click(await mobile().findByText("Astérion"));
    expect(mobile().queryByLabelText("Ajouter une relation")).not.toBeInTheDocument();
  });

  it("une demande reçue se voit dans la liste, et s'accepte depuis le détail", async () => {
    actions.acceptPersonaRelation.mockResolvedValue({ ok: true });
    mockSetup([
      { id: "r9", from_persona_id: "p2", to_persona_id: "p1", type: "t-couple", label: null, description: null, status: "pending" },
    ]);
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    // Pastille dans l'en-tête et sur la carte d'Adhi.
    expect(await screen.findByRole("button", { name: /^1 / })).toBeInTheDocument();
    await user.click(mobile().getByText("Adhi"));
    await user.click(mobile().getByRole("tab", { name: /← De/ }));
    await user.click(mobile().getByRole("button", { name: "Accepter" }));
    expect(actions.acceptPersonaRelation).toHaveBeenCalledWith("r9");
  });

  it("`?persona=` ouvre directement le détail de ce persona", async () => {
    searchParams.persona = "p2";
    mockSetup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);

    expect(await mobile().findByLabelText("Retour")).toBeInTheDocument();
    expect(mobile().getByText("@bob")).toBeInTheDocument();
    expect(mobile().getByRole("tab", { name: /← De/ })).toBeInTheDocument();
  });
});

describe("RelationsCanvas — légende filtrante", () => {
  it("éteindre un type retire ses flèches ; éteindre un groupe estompe ses personas", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);
    await mobile().findByText("Adhi");

    // Une corde par relation visible, dans le SVG desktop (monté, caché en CSS).
    // La légende est celle de la liste mobile : le panneau desktop a ses propres boutons.
    const arrows = () => document.querySelectorAll("[data-relation-edge]");
    expect(arrows()).toHaveLength(1);

    await user.click(mobile().getByRole("button", { name: "Masquer les relations « Allié »" }));
    expect(arrows()).toHaveLength(0);
    expect(mobile().getByRole("button", { name: "Afficher les relations « Allié »" })).toHaveAttribute("aria-pressed", "false");

    await user.click(mobile().getByRole("button", { name: "Tout afficher" }));
    expect(arrows()).toHaveLength(1);

    await user.click(mobile().getByRole("button", { name: "Masquer le groupe « Garde »" }));
    expect(arrows()).toHaveLength(0); // Astérion, du groupe Garde, est masqué : la relation aussi.
    expect(mobile().getByRole("button", { name: "Astérion" })).toHaveClass("opacity-20");
  });
});

describe("RelationsCanvas — recherche (header)", () => {
  const field = () => screen.getByPlaceholderText("Persona ou joueur…");

  it("le champ est toujours visible", async () => {
    mockSetup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);
    await mobile().findByText("Adhi");

    expect(field()).toBeInTheDocument();
    expect(screen.queryByLabelText("Effacer la recherche")).not.toBeInTheDocument();
  });

  it("filtre la liste mobile par nom de persona", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);
    await mobile().findByText("Adhi");

    await user.type(field(), "adh");
    expect(mobile().getByText("Adhi")).toBeInTheDocument();
    expect(mobile().queryByText("Astérion")).not.toBeInTheDocument();
    expect(mobile().queryByText("@bob")).not.toBeInTheDocument();
  });

  it("un pseudo de joueur qui matche garde tous ses personas", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);
    await mobile().findByText("Adhi");

    await user.type(field(), "bob");
    expect(mobile().getByText("Astérion")).toBeInTheDocument();
    expect(mobile().queryByText("Adhi")).not.toBeInTheDocument();
  });

  it("affiche un message quand la recherche ne correspond à rien", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);
    await mobile().findByText("Adhi");

    await user.type(field(), "zzz");
    expect(mobile().getByText("Aucun résultat.")).toBeInTheDocument();
  });

  it("le bouton d'effacement vide la recherche et restaure la liste complète", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);
    await mobile().findByText("Adhi");

    await user.type(field(), "adh");
    expect(mobile().queryByText("Astérion")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Effacer la recherche"));
    expect(mobile().getByText("Astérion")).toBeInTheDocument();
    expect(field()).toHaveValue("");
  });

  it("la touche Échap vide le champ et restaure la liste complète", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);
    await mobile().findByText("Adhi");

    await user.type(field(), "adh");
    await user.keyboard("{Escape}");
    expect(mobile().getByText("Astérion")).toBeInTheDocument();
    expect(field()).toHaveValue("");
  });

  it("propose les personas qui correspondent ; Entrée ouvre le premier", async () => {
    mockSetup();
    const user = userEvent.setup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);
    await mobile().findByText("Adhi");

    await user.type(field(), "astér");
    expect(screen.getByRole("option", { name: /Astérion/ })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(field()).toHaveValue("");
    // Le détail d'Astérion s'ouvre (la page mobile comme le panneau du canevas).
    expect(await mobile().findByLabelText("Retour")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Astérion" })).toBeInTheDocument();
  });
});
