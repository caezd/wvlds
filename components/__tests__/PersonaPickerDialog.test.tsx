import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

import { PersonaPickerDialog } from "@/components/personas/PersonaPickerDialog";

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
  setup();
});

afterEach(() => {
  for (const k of Object.keys(_store)) delete _store[k];
});

async function openDialog() {
  const user = userEvent.setup();
  render(
    <PersonaPickerDialog
      selected={null}
      onSelect={() => {}}
      userId="u1"
      trigger={<button>open</button>}
    />,
  );
  await user.click(screen.getByText("open"));
  return user;
}

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
