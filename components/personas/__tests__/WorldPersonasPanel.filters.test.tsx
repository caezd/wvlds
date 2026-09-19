import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock } from "@/test/supabaseMock";

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
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({ worldId: "w1", can: (perm: string) => perm === "personas.review" && canReview.value }),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ refresh: vi.fn() }) }));

import {
  WorldPersonasPanel,
  applyPersonaFilters,
  sortPersonas,
  PERSONA_FILTER_ALL as ALL,
  PERSONA_FILTER_NO_GROUP as NO_GROUP,
} from "@/components/personas/WorldPersonasPanel";

const OTHERS = [
  { id: "p1", name: "Aeris", avatar_url: null, user_id: "u1", created_at: "2026-01-01", narrative_status: "alive" as const, review_status: "approved", sheet_complete: true },
  { id: "p2", name: "Zorg", avatar_url: null, user_id: "u2", created_at: "2026-03-01", narrative_status: "dead" as const, review_status: "approved", sheet_complete: true },
  { id: "p3", name: "Élise", avatar_url: null, user_id: "u1", created_at: "2026-02-01", narrative_status: "alive" as const, review_status: "submitted", sheet_complete: true },
];

/** Ordre des `.from()` : personas, world_persona_groups, persona_group_assignments, profiles, world_members. */
function setup() {
  const mock = createSupabaseMock({
    results: [
      { data: OTHERS },
      { data: [{ id: "g1", name: "Garde", color: "#ff0000" }] },
      { data: [{ persona_id: "p2", group_id: "g1" }] },
      { data: [{ id: "u1", username: "alice" }, { id: "u2", username: "bob" }] },
      { data: [] },
    ],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => { vi.clearAllMocks(); canReview.value = false; });

describe("applyPersonaFilters / sortPersonas", () => {
  const base = { query: "", player: ALL, group: ALL, status: ALL, sheet: ALL };
  const groups = new Map([["p2", "g1"]]);

  it("filtre par joueur, groupe (dont « sans groupe ») et statut", () => {
    expect(applyPersonaFilters(OTHERS, { ...base, player: "u1" }, groups).map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(applyPersonaFilters(OTHERS, { ...base, group: "g1" }, groups).map((p) => p.id)).toEqual(["p2"]);
    expect(applyPersonaFilters(OTHERS, { ...base, group: NO_GROUP }, groups).map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(applyPersonaFilters(OTHERS, { ...base, status: "dead" }, groups).map((p) => p.id)).toEqual(["p2"]);
  });

  it("filtre par état de fiche : en relecture, validée, incomplète", () => {
    const withHoles = [...OTHERS, { ...OTHERS[0], id: "p4", name: "Bob", review_status: "approved", sheet_complete: false }];
    expect(applyPersonaFilters(withHoles, { ...base, sheet: "submitted" }, groups).map((p) => p.id)).toEqual(["p3"]);
    expect(applyPersonaFilters(withHoles, { ...base, sheet: "approved" }, groups).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(applyPersonaFilters(withHoles, { ...base, sheet: "incomplete" }, groups).map((p) => p.id)).toEqual(["p4"]);
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
  it("regroupe par lettre, grise un décédé et pose son badge", async () => {
    setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });

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

    await user.click(screen.getByRole("combobox", { name: "Statut" }));
    await user.click(await screen.findByRole("option", { name: "Décédé" }));

    expect(screen.getByRole("button", { name: "Zorg" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aeris" })).toBeNull();
  });

  it("pose le badge de fiche et, pour un relecteur, le raccourci vers les fiches à relire", async () => {
    canReview.value = true;
    setup();
    const user = userEvent.setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });

    const elise = screen.getByRole("button", { name: "Élise" });
    expect(elise.querySelector("[data-sheet-status='submitted']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Aeris" }).querySelector("[data-sheet-status]")).toBeNull();

    await user.click(screen.getByRole("button", { name: "1 fiche à relire" }));
    expect(screen.getByRole("button", { name: "Élise" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aeris" })).toBeNull();
    expect(screen.queryByRole("button", { name: "1 fiche à relire" })).toBeNull();
  });

  it("sans la permission, pas de raccourci de relecture", async () => {
    setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });
    expect(screen.queryByRole("button", { name: /à relire/ })).toBeNull();
  });

  it("le tri par date met les plus récents d'abord, sans lettres", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldPersonasPanel worldId="w1" myPersonas={[]} />);
    await screen.findByRole("button", { name: "Zorg" });

    await user.click(screen.getByRole("combobox", { name: "Tri" }));
    await user.click(await screen.findByRole("option", { name: "Plus récents" }));

    const names = ["Zorg", "Élise", "Aeris"].map((n) => screen.getByRole("button", { name: n }));
    const positions = names.map((el) => Array.from(document.querySelectorAll("button")).indexOf(el as HTMLButtonElement));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(screen.queryAllByText(/^[AEZ]$/).filter((el) => el.className.includes("tracking-wider"))).toHaveLength(0);
  });
});
