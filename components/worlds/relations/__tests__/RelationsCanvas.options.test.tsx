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

describe("RelationsCanvas — réglages d'affichage", () => {
  const P3 = { id: "p3", name: "Cyrène", avatar_url: null, user_id: "u1", narrative_status: "alive" };
  const R2 = { id: "r2", from_persona_id: "p2", to_persona_id: "p3", type: "t1", label: null, description: null, status: "accepted" };

  it("« Par groupe » découpe la couronne par groupe, et le choix se retient", async () => {
    const { user } = await mount();
    expect(document.querySelector('[data-player-arc="u1"]')).not.toBeNull();

    await user.click(screen.getByRole("radio", { name: "Par groupe" }));

    expect(document.querySelector("[data-player-arc]")).toBeNull();
    expect(document.querySelector('[data-group-arc="group:g1"]')).not.toBeNull();
    expect(document.querySelector('[data-group-arc="group:none"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem("wvlds:relations:w1") ?? "{}").groupBy).toBe("group");
  });

  it("« Sans les isolés » retire les personas sans aucune relation", async () => {
    const { user } = await mount({ personas: [...BASE_PERSONAS, P3] });
    expect(node("p3")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Sans les isolés" }));

    expect(document.querySelector('[data-persona-node="p3"]')).toBeNull();
    expect(node("p1")).not.toBeNull();
  });

  it("en vue Centré, seul le second cercle se règle ; le masquer retire le second degré", async () => {
    const { user } = await mount({ personas: [...BASE_PERSONAS, P3], relations: [R1, R2] });
    await user.click(viewRadio("Centré"));

    expect(screen.queryByRole("radio", { name: "Par groupe" })).toBeNull();
    // Adhi au centre : Astérion en relation directe, Cyrène au second degré.
    expect(node("p3")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Second cercle" }));
    expect(document.querySelector('[data-persona-node="p3"]')).toBeNull();
    expect(node("p2")).not.toBeNull();
  });
});
