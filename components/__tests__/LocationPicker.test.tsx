import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

const setPersonaLocation = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/app/actions/worldMap", () => ({ setPersonaLocation }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { LocationPicker } from "@/components/personas/PersonaEditSheet";

// Radix Select repose sur des API de pointeur absentes de jsdom.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
});

const CARTES = [
  { id: "m1", label: "Continent" },
  { id: "m2", label: "Donjon" },
];
const LIEUX = [
  { id: "pin1", title: "Le port", map_id: "m1" },
  { id: "pin2", title: "La salle du trône", map_id: "m2" },
];

/** Persona d'abord, puis cartes, puis lieux — l'ordre des trois lectures. */
function monter(mapPinId: string | null, maps = CARTES, pins = LIEUX) {
  const mock = createSupabaseMock({
    results: [{ data: { map_pin_id: mapPinId } }, { data: maps }, { data: pins }],
  });
  render(<LocationPicker personaId="p1" supabase={mock.client as never} worldId="w1" />);
  return mock;
}

describe("LocationPicker", () => {
  it("montre où se trouve le persona, et pose ailleurs", async () => {
    // « Où est Kael ? » — la fiche ne le disait pas.
    monter("pin1");
    const user = userEvent.setup();

    const choix = await screen.findByRole("combobox", { name: "Emplacement sur la carte" });
    expect(choix).toHaveTextContent("Le port");

    await user.click(choix);
    // Plusieurs cartes : les lieux sont groupés sous le nom de la leur.
    expect(await screen.findByText("Donjon")).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "La salle du trône" }));

    expect(setPersonaLocation).toHaveBeenCalledWith("p1", "pin2");
    expect(choix).toHaveTextContent("La salle du trône");
  });

  it("le retire de la carte avec « Nulle part »", async () => {
    monter("pin1");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("combobox", { name: "Emplacement sur la carte" }));
    await user.click(await screen.findByRole("option", { name: "Nulle part" }));

    expect(setPersonaLocation).toHaveBeenCalledWith("p1", null);
  });

  it("revient à la valeur d'avant si le serveur refuse", async () => {
    setPersonaLocation.mockRejectedValueOnce(new Error("rls"));
    monter(null);
    const user = userEvent.setup();

    const choix = await screen.findByRole("combobox", { name: "Emplacement sur la carte" });
    await user.click(choix);
    await user.click(await screen.findByRole("option", { name: "Le port" }));

    await waitFor(() => expect(choix).toHaveTextContent("Nulle part"));
  });

  it("ne se montre pas dans un monde sans lieu", async () => {
    // Un choix vide n'est pas un choix.
    const mock = monter(null, CARTES, []);
    await waitFor(() => expect(mock.buildersFor("world_map_pins")).toHaveLength(1));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
