import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";

const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
});

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const currentUserMock = vi.hoisted(() => ({ plan: "free" as string | null }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ plan: currentUserMock.plan }),
}));
// « Jouer les PNJ » (migration 182) : chaque test le décide.
const membership = vi.hoisted(() => ({ canPlayNpc: false }));
vi.mock("@/components/providers/WorldMembershipProvider", () => ({
  useWorldMembership: () => ({ worldId: "w1", can: (perm: string) => perm === "npc.play" && membership.canPlayNpc }),
}));

import { PersonaPickerDialog } from "@/components/personas/PersonaPickerDialog";
import { resetWorldReviewActiveCache, setWorldReviewActiveCache } from "@/hooks/useWorldReviewActive";

const personas: Persona[] = [
  { id: "p-caelan", user_id: "u1", name: "Caelan Voss", avatar_url: null, created_at: "2026-01-01T00:00:00Z" },
  { id: "p-corry", user_id: "u1", name: "Corry", avatar_url: null, created_at: "2026-01-02T00:00:00Z" },
  { id: "p-jett", user_id: "u1", name: "Jett", avatar_url: null, created_at: "2026-01-03T00:00:00Z" },
];

function setup(personaList: Persona[] = personas) {
  const mock = createSupabaseMock({
    user: { id: "u1" },
    results: [{ data: personaList, error: null }],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(_store)) delete _store[k];
  currentUserMock.plan = "free";
  membership.canPlayNpc = false;
  setup();
});

afterEach(() => {
  for (const k of Object.keys(_store)) delete _store[k];
  resetWorldReviewActiveCache();
});

async function openDialog(worldId?: string) {
  const user = userEvent.setup();
  render(
    <PersonaPickerDialog
      selected={null}
      onSelect={() => {}}
      userId="u1"
      worldId={worldId}
      trigger={<button>open</button>}
    />,
  );
  await user.click(screen.getByText("open"));
  return user;
}

describe("PersonaPickerDialog — PNJ du monde (migration 182)", () => {
  const withNpc: Persona[] = [
    ...personas,
    { id: "npc-1", user_id: "u9", name: "Aubergiste", avatar_url: null, created_at: "2025-01-01T00:00:00Z", is_npc: true, review_status: "approved", sheet_complete: true },
  ];

  it("avec « Jouer les PNJ », demande les siens et les PNJ, rangés sous leur titre, hors quota", async () => {
    membership.canPlayNpc = true;
    const mock = setup(withNpc);
    await openDialog("w1");
    await screen.findByText("Aubergiste");

    const builder = mock.buildersFor("personas")[0];
    expect(builder.or).toHaveBeenCalledWith("user_id.eq.u1,is_npc.eq.true");
    expect(screen.getByText("PNJ du monde")).toBeInTheDocument();
    const names = screen.getAllByText(/Caelan Voss|Corry|Jett|Aubergiste/).map((el) => el.textContent);
    expect(names).toEqual(["Caelan Voss", "Corry", "Jett", "Aubergiste"]);
    const npcRow = screen.getByText("Aubergiste").closest("div")!;
    expect(npcRow.querySelector("button")).not.toBeDisabled();
    expect(npcRow.querySelector("[data-npc]")).not.toBeNull();
  });

  it("marque un PNJ d'un badge « PNJ » écrit en toutes lettres", async () => {
    membership.canPlayNpc = true;
    setup(withNpc);
    await openDialog("w1");
    await screen.findByText("Aubergiste");

    expect(within(screen.getByText("Aubergiste").closest("div")!).getByText("PNJ")).toBeVisible();
    expect(within(screen.getByText("Jett").closest("div")!).queryByText("PNJ")).toBeNull();
  });

  it("sans la permission, ne demande que les siens", async () => {
    const mock = setup(personas);
    await openDialog("w1");
    await screen.findByText("Jett");
    const builder = mock.buildersFor("personas")[0];
    expect(builder.or).not.toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("is_npc", false);
    expect(screen.queryByText("PNJ du monde")).toBeNull();
  });
});

describe("PersonaPickerDialog — liste et favoris", () => {
  it("affiche les personas triés par ordre alphabétique", async () => {
    await openDialog();
    const names = (await screen.findAllByText(/Caelan Voss|Corry|Jett/)).map((el) => el.textContent);
    expect(names).toEqual(["Caelan Voss", "Corry", "Jett"]);
  });

  it("fait remonter un persona marqué favori en tête de liste", async () => {
    const user = await openDialog();
    await screen.findByText("Jett");

    const jettRow = screen.getByText("Jett").closest("div")!;
    const star = jettRow.querySelector("button[aria-label]")!;
    await user.click(star);

    const names = screen.getAllByText(/Caelan Voss|Corry|Jett/).map((el) => el.textContent);
    expect(names[0]).toBe("Jett");
  });

  it("persiste le favori dans le localStorage propre à l'utilisateur", async () => {
    const user = await openDialog();
    await screen.findByText("Corry");

    const corryRow = screen.getByText("Corry").closest("div")!;
    const star = corryRow.querySelector("button[aria-label]")!;
    await user.click(star);

    expect(JSON.parse(localStorage.getItem("persona-favorites:u1")!)).toEqual(["p-corry"]);
  });
});

describe("PersonaPickerDialog — recherche", () => {
  it("filtre la liste sur le nom, sans tenir compte des accents ni de la casse", async () => {
    setup([...personas, { id: "p-elodie", user_id: "u1", name: "Élodie", avatar_url: null, created_at: "2026-01-04T00:00:00Z" }]);
    const user = await openDialog();
    await screen.findByText("Jett");

    const champ = screen.getByRole("searchbox", { name: "Rechercher un persona…" });
    await user.type(champ, "COR");
    expect(screen.getByText("Corry")).toBeInTheDocument();
    expect(screen.queryByText("Jett")).toBeNull();
    expect(screen.queryByText("Caelan Voss")).toBeNull();

    await user.clear(champ);
    await user.type(champ, "elod");
    expect(screen.getByText("Élodie")).toBeInTheDocument();
    expect(screen.queryByText("Corry")).toBeNull();
  });

  it("dit qu'aucun persona ne correspond", async () => {
    const user = await openDialog();
    await screen.findByText("Jett");
    await user.type(screen.getByRole("searchbox", { name: "Rechercher un persona…" }), "zzz");
    expect(screen.getByText("Aucun persona ne correspond.")).toBeInTheDocument();
  });

  it("garde le titre des PNJ quand seul un PNJ suivant correspond", async () => {
    membership.canPlayNpc = true;
    setup([
      ...personas,
      { id: "npc-1", user_id: "u9", name: "Aubergiste", avatar_url: null, created_at: "2025-01-01T00:00:00Z", is_npc: true },
      { id: "npc-2", user_id: "u9", name: "Garde", avatar_url: null, created_at: "2025-01-02T00:00:00Z", is_npc: true },
    ]);
    const user = await openDialog("w1");
    await screen.findByText("Garde");
    await user.type(screen.getByRole("searchbox", { name: "Rechercher un persona…" }), "gar");
    expect(screen.getByText("PNJ du monde")).toBeInTheDocument();
    expect(screen.queryByText("Aubergiste")).toBeNull();
  });

  it("repart d'une liste entière à chaque ouverture", async () => {
    // Chaque ouverture recharge la liste : une réponse par chargement.
    setup().enqueue({ data: personas, error: null });
    const user = await openDialog();
    await screen.findByText("Jett");
    await user.type(screen.getByRole("searchbox", { name: "Rechercher un persona…" }), "cor");
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    await user.click(screen.getByText("open"));
    expect(await screen.findByText("Jett")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Rechercher un persona…" })).toHaveValue("");
  });
});

describe("PersonaPickerDialog — éligibilité (plan gratuit)", () => {
  const sixPersonas: Persona[] = [
    { id: "p1", user_id: "u1", name: "Alpha", avatar_url: null, created_at: "2026-01-01T00:00:00Z" },
    { id: "p2", user_id: "u1", name: "Beta", avatar_url: null, created_at: "2026-01-02T00:00:00Z" },
    { id: "p3", user_id: "u1", name: "Gamma", avatar_url: null, created_at: "2026-01-03T00:00:00Z" },
    { id: "p4", user_id: "u1", name: "Delta", avatar_url: null, created_at: "2026-01-04T00:00:00Z" },
    { id: "p5", user_id: "u1", name: "Epsilon", avatar_url: null, created_at: "2026-01-05T00:00:00Z" },
    { id: "p6", user_id: "u1", name: "Zeta", avatar_url: null, created_at: "2026-01-06T00:00:00Z" },
  ];

  it("verrouille le 6e persona (le plus récent) en plan gratuit", async () => {
    setup(sixPersonas);
    await openDialog();
    await screen.findByText("Zeta");

    const zetaRow = screen.getByText("Zeta").closest("div")!;
    const selectButton = zetaRow.querySelector("button")!;
    expect(selectButton).toBeDisabled();

    const alphaRow = screen.getByText("Alpha").closest("div")!;
    expect(alphaRow.querySelector("button")).not.toBeDisabled();
  });

  it("dit, sous le nom, pourquoi le persona hors quota est verrouillé", async () => {
    setup(sixPersonas);
    await openDialog();
    await screen.findByText("Zeta");

    expect(within(screen.getByText("Zeta").closest("div")!).getByText("Hors quota du plan gratuit")).toBeVisible();
    expect(within(screen.getByText("Alpha").closest("div")!).queryByText("Hors quota du plan gratuit")).toBeNull();
  });

  it("dit, sous le nom, qu'une fiche est incomplète ou pas encore validée", async () => {
    currentUserMock.plan = "subscribed";
    setup([
      { id: "p1", user_id: "u1", name: "Jesse", avatar_url: null, created_at: "2026-01-01T00:00:00Z", review_status: "submitted", sheet_complete: true },
      { id: "p2", user_id: "u1", name: "Mira", avatar_url: null, created_at: "2026-01-02T00:00:00Z", review_status: "draft", sheet_complete: false },
      { id: "p3", user_id: "u1", name: "Odo", avatar_url: null, created_at: "2026-01-03T00:00:00Z", review_status: "approved", sheet_complete: true },
    ]);
    // Un monde qui relit ses fiches (migration 184) : sans lui, seule la complétude verrouille.
    setWorldReviewActiveCache("w1", true);
    await openDialog("w1");
    await screen.findByText("Jesse");

    const row = (name: string) => within(screen.getByText(name).closest("div")!);
    expect(row("Jesse").getByText("Fiche non validée")).toBeVisible();
    // La fiche avant la validation : c'est ce que le joueur corrige d'abord.
    expect(row("Mira").getByText("Fiche incomplète")).toBeVisible();
    expect(row("Odo").queryByText(/Fiche/)).toBeNull();
  });

  it("ne verrouille aucun persona pour un compte abonné", async () => {
    currentUserMock.plan = "subscribed";
    setup(sixPersonas);
    await openDialog();
    await screen.findByText("Zeta");

    const zetaRow = screen.getByText("Zeta").closest("div")!;
    expect(zetaRow.querySelector("button")).not.toBeDisabled();
  });
});

describe("PersonaPickerDialog — en tiroir", () => {
  // La fiche d'un lieu s'ouvre en tiroir sur téléphone : un dialogue s'y
  // imbriquerait mal. C'est le premier appelant à donner son propre
  // déclencheur à la variante tiroir — la combinaison n'existait pas.
  it("ouvre la liste depuis un déclencheur fourni, sans reproche de Base UI", async () => {
    // Base UI se plaint dans la console quand `nativeButton` ment sur ce qu'on
    // lui donne — un avertissement ne fait échouer aucun test tant qu'on ne le
    // regarde pas, et celui-ci se répétait à chaque rendu.
    const plaintes: unknown[][] = [];
    const espion = vi.spyOn(console, "error").mockImplementation((...args) => { plaintes.push(args); });
    const user = userEvent.setup();
    render(
      <PersonaPickerDialog
        selected={null}
        onSelect={() => {}}
        userId="u1"
        variant="drawer"
        trigger={<button type="button">M&apos;installer ici</button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "M'installer ici" }));

    expect(await screen.findByText("Caelan Voss")).toBeInTheDocument();
    expect(plaintes.flat().join(" ")).not.toContain("nativeButton");
    espion.mockRestore();
  });

  it("rend le persona choisi", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <PersonaPickerDialog
        selected={null}
        onSelect={onSelect}
        userId="u1"
        variant="drawer"
        trigger={<button type="button">M&apos;installer ici</button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "M'installer ici" }));
    await user.click(await screen.findByText("Corry"));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "p-corry" }));
  });
});
