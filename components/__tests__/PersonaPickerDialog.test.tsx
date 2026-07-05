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

import { PersonaPickerDialog } from "@/components/personas/PersonaPickerDialog";

const personas: Persona[] = [
  { id: "p-caelan", user_id: "u1", name: "Caelan Voss", avatar_url: null },
  { id: "p-corry", user_id: "u1", name: "Corry", avatar_url: null },
  { id: "p-jett", user_id: "u1", name: "Jett", avatar_url: null },
];

function setup() {
  const mock = createSupabaseMock({
    user: { id: "u1" },
    results: [{ data: personas, error: null }],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(_store)) delete _store[k];
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
