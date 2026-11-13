import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

// Le localStorage de Node (sans fichier) masque celui de jsdom : une
// implémentation complète, comme dans les autres tests qui s'en servent.
const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
});

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockCreateClient(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => ({ get: () => null }) }));

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
const BASE_PERSONAS = [
  { id: "p1", name: "Adhi", avatar_url: null, user_id: "u1", narrative_status: "alive" },
  { id: "p2", name: "Astérion", avatar_url: null, user_id: "u2", narrative_status: "alive" },
];
const R1 = { id: "r1", from_persona_id: "p1", to_persona_id: "p2", type: "t1", label: null, description: "Amis d'enfance", status: "accepted" };

/** Résultats consommés dans l'ordre des appels `.from()` de `load()`, voir le test mobile. */
function mockSetup({
  relations = [R1],
  personas = BASE_PERSONAS,
}: { relations?: object[]; personas?: object[] } = {}) {
  const mock = createSupabaseMock({
    results: [
      { data: personas },
      { data: [{ user_id: "u1" }, { user_id: "u2" }] },
      { data: { owner_id: "u1" } },
      { data: [{ id: "g1", name: "Garde", color: "#3b82f6", sort_index: 0 }] },
      { data: [{ persona_id: "p2", group_id: "g1" }] },
      { data: relations },
      { data: TYPES },
      { data: [
        { id: "u1", username: "alice", avatar_url: null },
        { id: "u2", username: "bob", avatar_url: null },
      ] },
    ],
  });
  mockCreateClient.mockReturnValue(mock.client);
  return mock;
}

/** Le plateau desktop (monté à côté de la liste mobile, caché en CSS sous `lg`). */
function canvas() {
  return within(screen.getByTestId("relations-canvas"));
}
function panel(name: string) {
  return within(screen.getByRole("complementary", { name }));
}
const node = (id: string) => document.querySelector<HTMLElement>(`[data-persona-node="${id}"]`)!;
const edges = () => document.querySelectorAll("[data-relation-edge]");
const viewRadio = (name: string) => screen.getByRole("radio", { name });

async function mount(opts?: Parameters<typeof mockSetup>[0]) {
  mockSetup(opts);
  const user = userEvent.setup();
  const utils = render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);
  await canvas().findByRole("button", { name: "Adhi" });
  return { user, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("RelationsCanvas — vue Cercle", () => {
  it("un avatar par persona, un arc par joueur, une corde par relation, une flèche si elle n'a qu'un sens", async () => {
    await mount();
    expect(canvas().getByRole("button", { name: "Astérion" })).toBeInTheDocument();
    expect(canvas().getByRole("button", { name: "@alice" })).toHaveAttribute("data-player-arc", "u1");
    expect(canvas().getByRole("button", { name: "@bob" })).toBeInTheDocument();
    expect(edges()).toHaveLength(1);
    expect(document.querySelector("[data-relation-edge] [data-relation-arrow]")).not.toBeNull();
    // Le trait garde son épaisseur quel que soit le zoom.
    expect(document.querySelector("[data-relation-edge] path")).toHaveAttribute("vector-effect", "non-scaling-stroke");
    expect(viewRadio("Cercle")).toHaveAttribute("aria-checked", "true");
  });

  it("les deux sens d'une même relation ne font qu'une corde, sans flèche", async () => {
    await mount({ relations: [
      R1,
      { id: "r2", from_persona_id: "p2", to_persona_id: "p1", type: "t1", label: null, description: null, status: "accepted" },
    ] });
    expect(edges()).toHaveLength(1);
    expect(document.querySelector("[data-relation-arrow]")).toBeNull();
  });

  it("sans rien de choisi, le panneau donne la vue d'ensemble", async () => {
    await mount();
    const p = panel("Vue d’ensemble");
    expect(p.getByText("2 personas · 2 joueurs · 1 relation")).toBeInTheDocument();
    expect(p.getByRole("button", { name: "Masquer les relations « Allié »" })).toHaveTextContent(/Allié.*1/);
    expect(p.getByRole("button", { name: /@bob/ })).toHaveTextContent("1 persona");
  });

  it("cliquer un avatar ouvre sa fiche ; re-cliquer, Fermer, Échap ou le fond la referment", async () => {
    const { user } = await mount();

    await user.click(canvas().getByRole("button", { name: "Adhi" }));
    const p = panel("Adhi");
    expect(p.getByText("@alice · Vivant")).toBeInTheDocument();
    expect(p.getByText("Relations · 1")).toBeInTheDocument();
    expect(p.getByRole("button", { name: "Astérion" })).toBeInTheDocument();
    expect(p.getByText("Allié")).toBeInTheDocument();
    expect(p.getByText("· envers")).toBeInTheDocument();
    expect(p.getByText("Amis d'enfance")).toBeInTheDocument();
    expect(node("p1")).toHaveAttribute("aria-pressed", "true");
    // Le centre du cercle nomme le persona choisi.
    expect(document.querySelector("[data-ring-center]")).toHaveTextContent("Adhi1 relation");
    // Son lien est nommé par son type.
    expect(document.querySelector("[data-edge-label]")).toHaveTextContent("Allié");

    await user.click(node("p1"));
    expect(screen.queryByRole("complementary", { name: "Adhi" })).toBeNull();

    await user.click(node("p1"));
    await user.click(panel("Adhi").getByRole("button", { name: "Fermer" }));
    expect(screen.getByRole("complementary", { name: "Vue d’ensemble" })).toBeInTheDocument();

    await user.click(node("p1"));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "Adhi" })).toBeNull();

    await user.click(node("p1"));
    await user.click(document.querySelector("[data-relations-plate] svg rect")!);
    expect(screen.queryByRole("complementary", { name: "Adhi" })).toBeNull();
  });

  it("au survol, le centre donne le joueur et le nombre de relations", async () => {
    const { user } = await mount();
    expect(document.querySelector("[data-ring-center]")).toBeNull();
    await user.hover(node("p2"));
    expect(document.querySelector("[data-ring-center]")).toHaveTextContent("Astérion@bob · 1 relation");
    await user.unhover(node("p2"));
    expect(document.querySelector("[data-ring-center]")).toBeNull();
  });

  it("au survol d'une corde, une bulle nomme les deux personas et le type", async () => {
    await mount();
    const hit = document.querySelectorAll("[data-relation-edge] path")[2];
    fireEvent.mouseEnter(hit, { clientX: 100, clientY: 100 });
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Adhi→AstérionAllié");
    fireEvent.mouseLeave(hit);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("un joueur : sa fiche, ses personas, et le retour depuis l'un d'eux", async () => {
    const { user } = await mount();
    await user.click(canvas().getByRole("button", { name: "@bob" }));
    const p = panel("@bob");
    expect(p.getByText("1 persona · 1 relation")).toBeInTheDocument();
    expect(document.querySelector("[data-ring-center]")).toHaveTextContent("@bob1 persona");

    await user.click(p.getByRole("button", { name: /Astérion/ }));
    const sheet = panel("Astérion");
    await user.click(sheet.getByRole("button", { name: "@bob" }));
    expect(screen.getByRole("complementary", { name: "@bob" })).toBeInTheDocument();
  });

  it("la ligne d'un joueur, dans la vue d'ensemble, ouvre sa fiche", async () => {
    const { user } = await mount();
    await user.click(panel("Vue d’ensemble").getByRole("button", { name: /@alice/ }));
    expect(screen.getByRole("complementary", { name: "@alice" })).toBeInTheDocument();
  });
});

describe("RelationsCanvas — fiche d'un persona", () => {
  it("supprime une relation qui part de mon persona", async () => {
    actions.deletePersonaRelation.mockResolvedValue({ ok: true });
    const { user } = await mount();
    await user.click(node("p1"));
    await user.click(panel("Adhi").getByRole("button", { name: "Supprimer" }));
    expect(actions.deletePersonaRelation).toHaveBeenCalledWith("r1");
  });

  it("la pastille des demandes ouvre la demande, en tête de la fiche ; Accepter l'enregistre", async () => {
    actions.acceptPersonaRelation.mockResolvedValue({ ok: true });
    const { user } = await mount({ relations: [
      R1,
      { id: "r9", from_persona_id: "p2", to_persona_id: "p1", type: "t-couple", label: null, description: null, status: "pending" },
    ] });

    await user.click(screen.getByRole("button", { name: "1 demande en attente" }));
    const p = panel("Adhi");
    const rows = screen.getByRole("complementary", { name: "Adhi" }).querySelectorAll("[data-relation-row]");
    expect(rows[0].getAttribute("data-relation-row")).toBe("r9");
    expect(p.getByText("Demande en attente")).toBeInTheDocument();
    // En attente : un pointillé serré.
    const pendingEdge = [...edges()].find((g) => g.getAttribute("data-relation-edge") === "r9")!;
    expect(pendingEdge.querySelector("path")).toHaveAttribute("stroke-dasharray", "2 5");

    await user.click(p.getByRole("button", { name: "Accepter" }));
    expect(actions.acceptPersonaRelation).toHaveBeenCalledWith("r9");
  });

  it("Refuser une demande la supprime", async () => {
    actions.deletePersonaRelation.mockResolvedValue({ ok: true });
    const { user } = await mount({ relations: [
      { id: "r9", from_persona_id: "p2", to_persona_id: "p1", type: "t-couple", label: null, description: null, status: "pending" },
    ] });
    await user.click(screen.getByRole("button", { name: "1 demande en attente" }));
    await user.click(panel("Adhi").getByRole("button", { name: "Refuser" }));
    expect(actions.deletePersonaRelation).toHaveBeenCalledWith("r9");
  });

  it("« Ajouter une relation » ouvre le dialogue de création", async () => {
    actions.createPersonaRelation.mockResolvedValue({
      ok: true,
      relation: { id: "r2", world_id: "w1", from_persona_id: "p1", to_persona_id: "p2", type: "t1", label: null, description: null, status: "accepted" },
    });
    const { user } = await mount({ relations: [] });
    await user.click(node("p1"));
    await user.click(panel("Adhi").getByRole("button", { name: "Ajouter une relation" }));
    const dialog = await screen.findByRole("dialog", { name: "Nouvelle relation depuis Adhi" });
    await user.click(within(dialog).getByRole("option", { name: /Astérion/ }));
    await user.click(within(dialog).getByRole("radio", { name: /Allié/ }));
    await user.click(within(dialog).getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(actions.createPersonaRelation).toHaveBeenCalledWith({
      worldId: "w1", fromPersonaId: "p1", toPersonaId: "p2", typeId: "t1", description: null,
    }));
  });

  it("n'offre pas l'ajout ni le groupe sur le persona d'un autre joueur", async () => {
    const { user } = await mount();
    await user.click(node("p2"));
    const p = panel("Astérion");
    expect(p.queryByRole("button", { name: "Ajouter une relation" })).toBeNull();
    expect(p.queryByRole("button", { name: "Changer le groupe" })).toBeNull();
    expect(p.getByText("Garde")).toBeInTheDocument();
    expect(p.getByText("· de sa part")).toBeInTheDocument();
  });

  it("une ligne de la fiche met sa corde en avant au survol", async () => {
    const { user } = await mount();
    await user.click(node("p1"));
    await user.hover(screen.getByRole("complementary", { name: "Adhi" }).querySelector("[data-relation-row='r1']")!);
    const stroke = document.querySelector("[data-relation-edge='r1'] path")!;
    expect(stroke).toHaveAttribute("stroke-width", "2");
  });
});

describe("RelationsCanvas — vue Centré", () => {
  it("un double-clic passe en vue Centré sur le persona, et se retient d'une visite à l'autre", async () => {
    const { user, unmount } = await mount();
    expect(node("p2")).toHaveAttribute("title", "Double-clic : vue centrée");
    await user.dblClick(node("p2"));

    expect(viewRadio("Centré")).toHaveAttribute("aria-checked", "true");
    expect(panel("Astérion").getByText("Relations · 1")).toBeInTheDocument();
    expect(document.querySelector("[data-edge-label]")).toHaveTextContent("Allié");
    // Les arcs des joueurs n'existent qu'en vue Cercle.
    expect(document.querySelector("[data-player-arc]")).toBeNull();

    unmount();
    mockSetup();
    render(<RelationsCanvas worldId="w1" userId="u1" canAdmin={false} />);
    await canvas().findByRole("button", { name: "Adhi" });
    expect(viewRadio("Centré")).toHaveAttribute("aria-checked", "true");
  });

  it("le sélecteur met mon premier persona au centre ; un clic recentre ; Fermer revient au Cercle", async () => {
    const { user } = await mount();
    await user.click(viewRadio("Centré"));
    expect(panel("Adhi").getByText("Relations · 1")).toBeInTheDocument();

    await user.click(node("p2"));
    expect(screen.getByRole("complementary", { name: "Astérion" })).toBeInTheDocument();

    // Le fond ne désélectionne pas, en vue Centré.
    await user.click(screen.getByTestId("relations-canvas"));
    expect(screen.getByRole("complementary", { name: "Astérion" })).toBeInTheDocument();

    await user.click(panel("Astérion").getByRole("button", { name: "Fermer" }));
    expect(viewRadio("Cercle")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("complementary", { name: "Vue d’ensemble" })).toBeInTheDocument();
  });

  it("un persona sans relation le dit", async () => {
    const { user } = await mount({ relations: [] });
    await user.click(viewRadio("Centré"));
    expect(canvas().getByText("Aucune relation visible pour ce persona.")).toBeInTheDocument();
  });

  it("retient l'ancienne valeur « orbit » comme la vue Centré", async () => {
    localStorage.setItem("wvlds:relations:w1", JSON.stringify({ view: "orbit" }));
    await mount();
    expect(viewRadio("Centré")).toHaveAttribute("aria-checked", "true");
  });
});

describe("RelationsCanvas — filtres et recherche", () => {
  it("masquer un type retire ses cordes ; « Tout afficher » les rend ; un miroir réciproque ne compte qu'une fois", async () => {
    const { user } = await mount({ relations: [
      R1,
      { id: "r2", from_persona_id: "p1", to_persona_id: "p2", type: "t-couple", label: null, description: null, status: "accepted" },
      { id: "r3", from_persona_id: "p2", to_persona_id: "p1", type: "t-couple", label: null, description: null, status: "accepted" },
    ] });
    const p = panel("Vue d’ensemble");
    expect(p.getByRole("button", { name: "Masquer les relations « En couple »" })).toHaveTextContent(/En couple.*1/);
    expect(edges()).toHaveLength(2);

    await user.click(p.getByRole("button", { name: "Masquer les relations « Allié »" }));
    expect(edges()).toHaveLength(1);
    expect(p.getByRole("button", { name: "Afficher les relations « Allié »" })).toHaveAttribute("aria-pressed", "false");

    await user.click(p.getByRole("button", { name: "Tout afficher" }));
    expect(edges()).toHaveLength(2);
  });

  it("la recherche estompe les autres personas ; Entrée ouvre le premier résultat", async () => {
    const { user } = await mount();
    const field = screen.getByPlaceholderText("Persona ou joueur…");
    await user.type(field, "astér");
    expect(node("p1").style.opacity).toBe("0.2");
    expect(node("p2").style.opacity).toBe("1");
    await user.keyboard("{Enter}");
    expect(field).toHaveValue("");
    expect(screen.getByRole("complementary", { name: "Astérion" })).toBeInTheDocument();
  });

  it("les raccourcis ignorent la saisie dans un champ", async () => {
    const { user } = await mount();
    await user.click(node("p1"));
    fireEvent.keyDown(screen.getByPlaceholderText("Persona ou joueur…"), { key: "Escape" });
    expect(screen.getByRole("complementary", { name: "Adhi" })).toBeInTheDocument();
  });
});

describe("RelationsCanvas — zoom", () => {
  it("les boutons zooment de 25 %, le plateau change de taille réelle, Recentrer revient à 100 %", async () => {
    const { user } = await mount();
    const plate = document.querySelector<HTMLElement>("[data-relations-plate]")!;
    expect(canvas().getByText("100 %")).toBeInTheDocument();
    expect(plate.style.width).toMatch(/\*\s?1\.0000\)/);

    await user.click(canvas().getByRole("button", { name: "Zoom avant" }));
    expect(canvas().getByText("125 %")).toBeInTheDocument();
    expect(plate.style.width).toMatch(/\*\s?1\.2500\)/);
    expect(plate.style.transform).not.toContain("scale");

    await user.click(canvas().getByRole("button", { name: "Zoom arrière" }));
    expect(canvas().getByText("100 %")).toBeInTheDocument();

    for (let i = 0; i < 10; i++) await user.click(canvas().getByRole("button", { name: "Zoom arrière" }));
    expect(canvas().getByText("50 %")).toBeInTheDocument();

    await user.click(canvas().getByRole("button", { name: "Réinitialiser la vue" }));
    expect(canvas().getByText("100 %")).toBeInTheDocument();
  });

  it("+ et - zooment d'un cran au clavier", async () => {
    await mount();
    fireEvent.keyDown(document.body, { key: "+" });
    expect(canvas().getByText("125 %")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "-" });
    expect(canvas().getByText("100 %")).toBeInTheDocument();
  });

  it("la molette zoome de 20 % par cran", async () => {
    await mount();
    fireEvent.wheel(screen.getByTestId("relations-canvas"), { deltaY: -100 });
    expect(canvas().getByText("120 %")).toBeInTheDocument();
  });

  it("un clic qui suit un glisser ne choisit pas le persona", async () => {
    await mount();
    const vp = screen.getByTestId("relations-canvas");
    fireEvent.pointerDown(node("p1"), { pointerId: 1, button: 0, clientX: 10, clientY: 10, pointerType: "mouse" });
    fireEvent.pointerMove(vp, { pointerId: 1, clientX: 40, clientY: 30, pointerType: "mouse" });
    fireEvent.pointerUp(vp, { pointerId: 1, clientX: 40, clientY: 30, pointerType: "mouse" });
    fireEvent.click(node("p1"));
    expect(screen.queryByRole("complementary", { name: "Adhi" })).toBeNull();
    const plate = document.querySelector<HTMLElement>("[data-relations-plate]")!;
    expect(plate.style.transform).toContain("30px");
  });
});
