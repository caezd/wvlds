import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const actions = vi.hoisted(() => ({
  acceptPersonaRelation: vi.fn(),
  deletePersonaRelation: vi.fn(),
}));
vi.mock("@/app/actions/personaRelations", () => actions);

import { PersonaRelationsSection } from "@/components/personas/PersonaRelationsSection";

// La fiche de Kolt (joueur u1). Soren (u2) est en couple avec lui — les deux
// sens existent, acceptés. Nyx (u3) le déteste, à sens unique. Vyper (u2)
// lui propose une alliance, en attente.
const TYPES = [
  { id: "t-couple", world_id: "w1", name: "En couple", color: "#ec4899", dash: "", sort_index: 0, mutual: true, marital_status: "in_relationship" },
  { id: "t-ally", world_id: "w1", name: "Allié", color: "#22c55e", dash: "", sort_index: 1, mutual: true, marital_status: null },
  { id: "t-enemy", world_id: "w1", name: "Ennemi", color: "#ef4444", dash: "", sort_index: 2, mutual: false, marital_status: null },
];
const rel = (id: string, from: string, to: string, type: string, status = "accepted", description: string | null = null) =>
  ({ id, world_id: "w1", from_persona_id: from, to_persona_id: to, type, label: null, description, status, created_by: "u1", created_at: "2026-09-13" });
const RELATIONS = [
  rel("r1", "kolt", "soren", "t-couple"),
  rel("r2", "soren", "kolt", "t-couple"),
  rel("r3", "nyx", "kolt", "t-enemy", "accepted", "Il m'a trahi."),
  rel("r4", "vyper", "kolt", "t-ally", "pending"),
  rel("r5", "kolt", "nyx", "t-ally", "pending"),
];
const OTHERS = [
  { id: "soren", name: "Soren", avatar_url: null, user_id: "u2" },
  { id: "nyx", name: "Nyx", avatar_url: null, user_id: "u3" },
  { id: "vyper", name: "Vyper", avatar_url: null, user_id: "u2" },
];

function mount(selfId: string | null, canAdmin = false) {
  const mock = createSupabaseMock({ results: [{ data: RELATIONS }, { data: TYPES }, { data: OTHERS }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  render(<PersonaRelationsSection personaId="kolt" worldId="w1" ownerId="u1" selfId={selfId} canAdmin={canAdmin} />);
  return mock;
}

describe("PersonaRelationsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.acceptPersonaRelation.mockResolvedValue({ ok: true });
    actions.deletePersonaRelation.mockResolvedValue({ ok: true });
  });

  it("répartit en deux listes, et ne montre une relation réciproque qu'une fois", async () => {
    mount("u9");
    const out = await screen.findByRole("heading", { name: "Ce qu’il pense des autres" });
    const outList = out.parentElement!;
    const inList = screen.getByRole("heading", { name: "Ce qu’on pense de lui" }).parentElement!;

    expect(within(outList).getByText("Soren")).toBeInTheDocument();
    expect(within(outList).getByText("⇄")).toBeInTheDocument();
    expect(within(inList).queryByText("Soren")).toBeNull();

    expect(within(inList).getByText("Nyx")).toBeInTheDocument();
    expect(within(inList).getByText("Il m'a trahi.")).toBeInTheDocument();
    expect(within(inList).getByText("Vyper")).toBeInTheDocument();
    expect(screen.getAllByText("En attente")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Voir sur le canevas/ })).toHaveAttribute("href", "/w/w1?view=canvas&persona=kolt");
  });

  it("un visiteur ne peut ni répondre, ni annuler, ni rompre", async () => {
    mount("u9");
    await screen.findByText("Soren");
    expect(screen.queryByRole("button", { name: "Accepter" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Annuler la demande" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rompre" })).toBeNull();
  });

  // Chaque geste relit les relations : un montage par geste, la file de
  // résultats du mock ne servant qu'une fois.
  it("le joueur du persona accepte la demande qui l'attend", async () => {
    const user = userEvent.setup();
    mount("u1");
    await screen.findByText("Soren");
    await user.click(screen.getByRole("button", { name: "Accepter" }));
    expect(actions.acceptPersonaRelation).toHaveBeenCalledWith("r4");
  });

  it("le joueur du persona annule la demande qu'il a envoyée", async () => {
    const user = userEvent.setup();
    mount("u1");
    await screen.findByText("Soren");
    await user.click(screen.getByRole("button", { name: "Annuler la demande" }));
    expect(actions.deletePersonaRelation).toHaveBeenCalledWith("r5");
  });

  it("le joueur du persona rompt son couple", async () => {
    const user = userEvent.setup();
    mount("u1");
    await screen.findByText("Soren");
    await user.click(screen.getByRole("button", { name: "Rompre" }));
    expect(actions.deletePersonaRelation).toHaveBeenCalledWith("r1");
  });

  it("un admin retire et rompt, mais ne répond pas à la place du joueur", async () => {
    mount("u9", true);
    await screen.findByText("Soren");
    expect(screen.queryByRole("button", { name: "Accepter" })).toBeNull();
    expect(screen.getByRole("button", { name: "Annuler la demande" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rompre" })).toBeInTheDocument();
  });

  it("sans relation, dit le vide et mène au canevas", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }, { data: TYPES }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    render(<PersonaRelationsSection personaId="kolt" worldId="w1" ownerId="u1" selfId="u1" />);
    expect(await screen.findByText("Aucune relation")).toBeInTheDocument();
    await waitFor(() => expect(mock.buildersFor("personas")).toHaveLength(0));
  });
});
