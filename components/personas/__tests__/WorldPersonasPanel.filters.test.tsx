import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock } from "@/test/supabaseMock";

// jsdom fournit un localStorage partiel (pas de .clear()) — remplacé par une
// implémentation complète, comme lib/__tests__/searchHistory.test.ts.
const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
});

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/components/personas/PersonaCreateSheet", () => ({
  PersonaCreateSheet: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));
// La fiche complète n'est pas l'objet du test : le déclencheur suffit.
vi.mock("@/components/personas/PersonaProfileSheetTrigger", () => ({
  PersonaProfileSheetTrigger: ({ children, label, triggerClassName }: { children: React.ReactNode; label: string; triggerClassName?: string }) => (
    <button type="button" aria-label={label} className={triggerClassName}>{children}</button>
  ),
}));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: "me", username: "moi", plan: "free" }) }));
// Relecteur ou non : chaque test le décide.
const canReview = { value: false };
const canManageNpc = { value: false };
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({
    worldId: "w1",
    can: (perm: string) => (perm === "personas.review" && canReview.value) || (perm === "npc.manage" && canManageNpc.value),
  }),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ refresh: vi.fn() }) }));
// Le monde relit ses fiches (migration 184) — sauf quand un test le coupe.
const review = vi.hoisted(() => ({ active: true }));
vi.mock("@/hooks/useWorldReviewActive", () => ({ useWorldReviewActive: () => review.active }));

import {
  WorldPersonasPanel,
  applyPersonaFilters,
  sortPersonas,
  PERSONA_FILTER_ALL as ALL,
  PERSONA_FILTER_NO_GROUP as NO_GROUP,
  PERSONA_FILTER_OFFSTAGE as OFFSTAGE,
} from "@/components/personas/WorldPersonasPanel";

const OTHERS = [
  { id: "p1", name: "Aeris", avatar_url: null, user_id: "u1", created_at: "2026-01-01", narrative_status: "alive" as const, review_status: "approved", sheet_complete: true },
  { id: "p2", name: "Zorg", avatar_url: null, user_id: "u2", created_at: "2026-03-01", narrative_status: "dead" as const, review_status: "approved", sheet_complete: true },
  { id: "p3", name: "Élise", avatar_url: null, user_id: "u1", created_at: "2026-02-01", narrative_status: "alive" as const, review_status: "submitted", sheet_complete: true },
];
const NPC = { id: "n1", name: "Aubergiste", avatar_url: null, user_id: "u2", created_at: "2026-01-15", narrative_status: "alive" as const, review_status: "approved", sheet_complete: true, is_npc: true };

/**
 * Ordre des `.from()` : personas, world_persona_groups, persona_group_assignments,
 * [persona_sections, persona_section_fields si gestionnaire de PNJ et PNJ présents], profiles, world_members.
 */
function setup(withNpc = false) {
  const npcSections = withNpc && canManageNpc.value ? [{ data: [] }] : [];
  const mock = createSupabaseMock({
    results: [
      { data: withNpc ? [...OTHERS, NPC] : OTHERS },
      { data: [{ id: "g1", name: "Garde", color: "#ff0000" }] },
      { data: [{ persona_id: "p2", group_id: "g1" }] },
      ...npcSections,
      { data: [{ id: "u1", username: "alice" }, { id: "u2", username: "bob" }] },
      { data: [] },
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); canReview.value = false; canManageNpc.value = false; review.active = true; });

/**
 * Choisit une valeur dans le menu « Filtres » : ouvre le menu, entre dans le
 * sous-menu de la dimension au clavier (sous jsdom, les rectangles sont nuls
 * et le survol ne tient pas), puis choisit l'option.
 */
async function pickFilter(user: ReturnType<typeof userEvent.setup>, dimension: string, option: string) {
  await user.click(screen.getByRole("button", { name: "Filtres" }));
  (await screen.findByRole("menuitem", { name: new RegExp(`^${dimension}`) })).focus();
  await user.keyboard("{ArrowRight}");
  await user.click(await screen.findByRole("menuitemradio", { name: option }));
}

describe("applyPersonaFilters / sortPersonas", () => {
  const base = { query: "", player: ALL, group: ALL, status: ALL, sheet: ALL, kind: ALL };
  const groups = new Map([["p2", "g1"]]);

  it("filtre par joueur, groupe (dont « sans groupe ») et statut", () => {
    expect(applyPersonaFilters(OTHERS, { ...base, player: "u1" }, groups).map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(applyPersonaFilters(OTHERS, { ...base, group: "g1" }, groups).map((p) => p.id)).toEqual(["p2"]);
    expect(applyPersonaFilters(OTHERS, { ...base, group: NO_GROUP }, groups).map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(applyPersonaFilters(OTHERS, { ...base, status: "dead" }, groups).map((p) => p.id)).toEqual(["p2"]);
    const retired = { ...OTHERS[0], id: "p5", narrative_status: "retired" as const };
    expect(applyPersonaFilters([...OTHERS, retired], { ...base, status: OFFSTAGE }, groups).map((p) => p.id)).toEqual(["p2", "p5"]);
  });

  it("filtre par état de fiche : en relecture, validée, incomplète", () => {
    const withHoles = [...OTHERS, { ...OTHERS[0], id: "p4", name: "Bob", review_status: "approved", sheet_complete: false }];
    expect(applyPersonaFilters(withHoles, { ...base, sheet: "submitted" }, groups).map((p) => p.id)).toEqual(["p3"]);
    expect(applyPersonaFilters(withHoles, { ...base, sheet: "approved" }, groups).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(applyPersonaFilters(withHoles, { ...base, sheet: "incomplete" }, groups).map((p) => p.id)).toEqual(["p4"]);
  });

  it("filtre par type : personas des joueurs ou PNJ", () => {
    const withNpc = [...OTHERS, NPC];
    expect(applyPersonaFilters(withNpc, { ...base, kind: "npc" }, groups).map((p) => p.id)).toEqual(["n1"]);
    expect(applyPersonaFilters(withNpc, { ...base, kind: "player" }, groups).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("recherche sans casse ni accents, sur le nom ou le joueur", () => {
    const withNames = OTHERS.map((p) => ({ ...p, username: p.user_id === "u1" ? "alice" : "bob" }));
    expect(applyPersonaFilters(withNames, { ...base, query: "elise" }, groups).map((p) => p.id)).toEqual(["p3"]);
    expect(applyPersonaFilters(withNames, { ...base, query: "BOB" }, groups).map((p) => p.id)).toEqual(["p2"]);
  });

  it("trie par nom (accents ignorés), du plus récent ou du plus ancien", () => {
    expect(sortPersonas(OTHERS, "name").map((p) => p.name)).toEqual(["Aeris", "Élise", "Zorg"]);
    expect(sortPersonas(OTHERS, "newest").map((p) => p.id)).toEqual(["p2", "p3", "p1"]);
    expect(sortPersonas(OTHERS, "oldest").map((p) => p.id)).toEqual(["p1", "p3", "p2"]);
  });
});

describe("WorldPersonasPanel — filtres et statut", () => {
  it("en liste, regroupe par lettre avec un index ; grise un décédé et pose son badge", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });
    await user.click(screen.getByRole("radio", { name: "Liste" }));
    expect(within(screen.getByRole("navigation", { name: "Index alphabétique" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["A", "E", "Z"]);

    // Les lettres d'index (les initiales des avatars sont dans les tuiles, ailleurs).
    const letters = screen.getAllByText(/^[AEZ]$/).filter((el) => el.className.includes("tracking-wider"));
    expect(letters.map((el) => el.textContent)).toEqual(["A", "E", "Z"]); // « Élise » s’indexe sous E
    const zorg = screen.getByRole("button", { name: "Zorg" });
    expect(within(zorg).getByText("Décédé")).toBeInTheDocument();
    expect(zorg.querySelector("[data-narrative-status='dead']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Aeris" }).querySelector("[data-narrative-status='dead']")).toBeNull();
  });

  it("la recherche filtre les autres personas et annonce l'absence de résultat", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });

    await user.type(screen.getByRole("searchbox"), "zor");
    expect(screen.getByRole("button", { name: "Zorg" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aeris" })).toBeNull();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "xyz");
    expect(screen.getByText("Aucun persona ne correspond.")).toBeInTheDocument();
  });

  it("le filtre de statut ne garde que les personas concernés", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });

    await pickFilter(user, "Statut", "Décédé");

    expect(screen.getByRole("button", { name: "Zorg" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aeris" })).toBeNull();
    // Le filtre actif se lit sur le bouton et en pastille ; la retirer rend tout le monde.
    expect(screen.getByTestId("active-filter-count")).toHaveTextContent("1");
    await user.click(screen.getByRole("button", { name: "Retirer le filtre Statut : Décédé" }));
    expect(screen.getByRole("button", { name: "Aeris" })).toBeInTheDocument();
    expect(screen.queryByTestId("active-filter-count")).toBeNull();
  });

  it("pose le badge de fiche et, pour un relecteur, la carte « Fiches à relire » qui bascule le filtre", async () => {
    canReview.value = true;
    setup();
    const user = userEvent.setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });

    const elise = screen.getByRole("button", { name: "Élise" });
    expect(elise.querySelector("[data-sheet-status='submitted']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Aeris" }).querySelector("[data-sheet-status]")).toBeNull();

    const card = screen.getByRole("button", { name: /Fiches à relire/ });
    expect(card).toHaveTextContent("1");
    await user.click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Élise" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aeris" })).toBeNull();
    // Un second clic retire le filtre.
    await user.click(card);
    expect(card).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Aeris" })).toBeInTheDocument();
  });

  it("sans relecture dans le monde : ni badge de brouillon, ni raccourci, et le filtre « Fiche » ne connaît qu'« incomplète »", async () => {
    review.active = false;
    canReview.value = true;
    setup();
    const user = userEvent.setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });
    expect(screen.getByRole("button", { name: "Élise" }).querySelector("[data-sheet-status]")).toBeNull();
    expect(screen.queryByRole("button", { name: /à relire/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Filtres" }));
    (await screen.findByRole("menuitem", { name: /^Fiche/ })).focus();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("menuitemradio", { name: "Fiche incomplète" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: "En relecture" })).toBeNull();
  });

  it("sans la permission, pas de raccourci de relecture", async () => {
    setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });
    expect(screen.queryByRole("button", { name: /à relire/ })).toBeNull();
  });

  it("les PNJ ont leur étagère, avec le badge et sans pseudo de joueur ; « Nouveau PNJ » pour qui les gère", async () => {
    setup(true);
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    const npc = await screen.findByRole("button", { name: "Aubergiste" });
    expect(npc.querySelector("[data-npc]")).not.toBeNull();
    expect(within(npc).queryByText("@bob")).toBeNull();
    expect(screen.getByRole("heading", { name: /^PNJ/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nouveau PNJ" })).toBeNull();
    // Le PNJ ne figure pas sur l'étagère de son joueur (Zorg seulement).
    expect(screen.getByRole("button", { name: "Zorg" }).querySelector("[data-npc]")).toBeNull();
  });

  it("sans PNJ ni permission, ni section ni filtre de type", async () => {
    setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });
    expect(screen.queryByRole("heading", { name: /^PNJ/ })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Type" })).toBeNull();
  });

  it("un gestionnaire ouvre l'éditeur du PNJ et peut en créer", async () => {
    canManageNpc.value = true;
    setup(true);
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });
    // La tuile éditable porte « Modifier » (PersonaCard), pas le déclencheur de fiche mocké.
    const tile = screen.getByText("Aubergiste").closest("button")!;
    expect(within(tile).getByText("Modifier")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nouveau PNJ" })).toBeInTheDocument();
  });

  it("range par joueur par défaut, par groupe sur demande, et s'en souvient pour ce monde", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });

    expect(screen.getByRole("heading", { name: "@alice" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "@bob" })).toBeInTheDocument();
    // En tête de l'étagère : l'avatar du joueur et sa présence (hors ligne sans fournisseur de présence).
    const aliceShelf = screen.getByRole("heading", { name: "@alice" }).closest("section")!;
    expect(aliceShelf.querySelector("[data-presence='offline']")).not.toBeNull();
    expect(within(aliceShelf).getAllByText("Hors ligne").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("radio", { name: "Par groupe" }));
    expect(screen.getByRole("radio", { name: "Par groupe" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("heading", { name: "Garde" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sans groupe" })).toBeInTheDocument();
    // Le mur d'un groupe : ses chiffres sous le nom, sans défilement horizontal.
    const garde = screen.getByRole("heading", { name: "Garde" }).closest("section")!;
    expect(within(garde).getByText("0 en jeu · 1 hors jeu")).toBeInTheDocument();
    expect(garde.querySelector(".overflow-x-auto")).toBeNull();
    expect(screen.queryByRole("heading", { name: "@alice" })).toBeNull();
    expect(localStorage.getItem("personas.shelfMode.w1")).toBe("group");
  });

  it("la carte « Hors jeu » ne garde que les décédés et retirés", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });

    await user.click(screen.getByRole("button", { name: /Hors jeu/ }));
    expect(screen.getByRole("button", { name: "Zorg" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aeris" })).toBeNull();
    expect(screen.getByRole("button", { name: "Retirer le filtre Statut : Hors jeu" })).toBeInTheDocument();
  });
});
