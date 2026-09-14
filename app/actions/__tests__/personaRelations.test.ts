import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUserId: vi.fn().mockResolvedValue("u1") }));

import {
  createPersonaRelation,
  updatePersonaRelation,
  deletePersonaRelation,
  acceptPersonaRelation,
} from "@/app/actions/personaRelations";

const use = (mock: ReturnType<typeof createSupabaseMock>) =>
  vi.mocked(createClient).mockResolvedValue(mock.client as never);

beforeEach(() => vi.clearAllMocks());

const BASE = { worldId: "w1", fromPersonaId: "p-mine", toPersonaId: "p-theirs", typeId: "t1" };

// ──────────────────────────────────────────────────────────────────────────
// La règle qui décide si une relation naît acceptée ou en attente — celle de
// la migration 173, appliquée une fois ici pour tous les écrans.
// ──────────────────────────────────────────────────────────────────────────
describe("createPersonaRelation — acceptée ou en attente", () => {
  it("un type à sens unique naît accepté, sans consulter personne", async () => {
    const mock = createSupabaseMock({ results: [
      { data: { mutual: false } },                  // world_relation_types
      { data: { id: "r1", status: "accepted" } },   // insert
    ] });
    use(mock);
    const res = await createPersonaRelation(BASE);
    expect(res.ok).toBe(true);
    expect(mock.buildersFor("persona_relations")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "accepted", created_by: "u1", type: "t1" }),
    );
    // Ni la cible ni les droits n'ont été regardés.
    expect(mock.buildersFor("personas")).toHaveLength(0);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("un type réciproque vers le persona d'un autre joueur naît en attente", async () => {
    const mock = createSupabaseMock({ results: [
      { data: { mutual: true } },
      { data: { user_id: "u2" } },                  // personas (cible)
      { data: { id: "r1", status: "pending" } },
    ] });
    use(mock);
    const res = await createPersonaRelation(BASE);
    expect(res.ok).toBe(true);
    expect(mock.buildersFor("persona_relations")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" }),
    );
  });

  it("un type réciproque entre deux de ses personas naît accepté", async () => {
    const mock = createSupabaseMock({ results: [
      { data: { mutual: true } },
      { data: { user_id: "u1" } },
      { data: { id: "r1" } },
    ] });
    use(mock);
    await createPersonaRelation(BASE);
    expect(mock.buildersFor("persona_relations")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "accepted" }),
    );
  });

  it("un admin n'accepte pas à la place du joueur : même pour lui, c'est une demande", async () => {
    const mock = createSupabaseMock({ results: [
      { data: { mutual: true } },
      { data: { user_id: "u2" } },
      { data: { id: "r1" } },
    ] });
    use(mock);
    await createPersonaRelation(BASE);
    // Le rôle n'est même pas consulté.
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.buildersFor("persona_relations")[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" }),
    );
  });

  it("refuse un type qui n'est pas du monde, sans écrire", async () => {
    const mock = createSupabaseMock({ results: [{ data: null }] });
    use(mock);
    expect(await createPersonaRelation(BASE)).toEqual({ ok: false, error: "unsupportedValue" });
    expect(mock.buildersFor("persona_relations")).toHaveLength(0);
  });

  it.each([
    ["une relation d'un persona à lui-même", { ...BASE, toPersonaId: BASE.fromPersonaId }],
    ["une clé de trop", { ...BASE, status: "accepted" } as never],
    ["une description trop longue", { ...BASE, description: "x".repeat(5001) }],
  ])("refuse %s sans appeler Supabase", async (_n, input) => {
    const mock = createSupabaseMock();
    use(mock);
    const res = await createPersonaRelation(input);
    expect(res.ok).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });
});

describe("updatePersonaRelation", () => {
  it("change la description, et lit la ligne rendue pour détecter un refus RLS", async () => {
    const mock = createSupabaseMock({ results: [{ data: [{ id: "r1" }] }] });
    use(mock);
    expect(await updatePersonaRelation("r1", { description: "  Vieux rivaux " })).toEqual({ ok: true });
    expect(mock.buildersFor("persona_relations")[0].update).toHaveBeenCalledWith({ description: "Vieux rivaux" });
  });

  it("un refus RLS — zéro ligne mise à jour — est rendu comme tel", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }] });
    use(mock);
    expect(await updatePersonaRelation("r1", { description: "x" })).toEqual({ ok: false, error: "forbidden" });
  });

  it("change le type entre deux types à sens unique", async () => {
    const mock = createSupabaseMock({ results: [
      { data: { world_id: "w1", type: "t1" } },
      { data: [{ id: "t1", mutual: false }, { id: "t2", mutual: false }] },
      { data: [{ id: "r1" }] },
    ] });
    use(mock);
    expect(await updatePersonaRelation("r1", { typeId: "t2" })).toEqual({ ok: true });
    expect(mock.buildersFor("persona_relations")[1].update).toHaveBeenCalledWith({ type: "t2" });
  });

  it("refuse de changer le type d'une relation réciproque, ou vers un type réciproque", async () => {
    const mock = createSupabaseMock({ results: [
      { data: { world_id: "w1", type: "t1" } },
      { data: [{ id: "t1", mutual: false }, { id: "t-couple", mutual: true }] },
    ] });
    use(mock);
    expect(await updatePersonaRelation("r1", { typeId: "t-couple" })).toEqual({ ok: false, error: "unsupportedValue" });
    expect(mock.buildersFor("persona_relations")).toHaveLength(1);
  });
});

describe("deletePersonaRelation et acceptPersonaRelation", () => {
  it("supprimer rend « interdit » quand la RLS n'a rien effacé", async () => {
    use(createSupabaseMock({ results: [{ data: [] }] }));
    expect(await deletePersonaRelation("r1")).toEqual({ ok: false, error: "forbidden" });
  });

  it("supprimer confirme quand une ligne est partie", async () => {
    use(createSupabaseMock({ results: [{ data: [{ id: "r1" }] }] }));
    expect(await deletePersonaRelation("r1")).toEqual({ ok: true });
  });

  it("accepter passe par la RPC, seule à pouvoir écrire le miroir et les fiches", async () => {
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue({ data: null, error: null });
    use(mock);
    expect(await acceptPersonaRelation("r1")).toEqual({ ok: true });
    expect(mock.rpc).toHaveBeenCalledWith("accept_persona_relation", { p_relation_id: "r1" });
    expect(mock.from).not.toHaveBeenCalled();
  });
});
