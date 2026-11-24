import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const setWorldInventoryMode = vi.fn();
const setWorldInventorySlots = vi.fn();
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldInventoryMode: (...args: unknown[]) => setWorldInventoryMode(...args),
  setWorldInventorySlots: (...args: unknown[]) => setWorldInventorySlots(...args),
}));

import { WorldInventorySettings } from "@/components/worlds/settings/WorldInventorySettings";
import type { World } from "@/types/worlds";

const monde = (patch: Partial<World> = {}) =>
  ({ id: "w1", name: "Monde", enable_economy: true, currency_units: [{ name: "Cuivre", short: "pc", value: 1 }], ...patch }) as World;
const champ = (name: string) => screen.getByRole("spinbutton", { name });
const enregistrer = () => screen.getByRole("button", { name: "Enregistrer les emplacements" });

beforeEach(() => {
  vi.clearAllMocks();
  setWorldInventoryMode.mockResolvedValue({ ok: true });
  setWorldInventorySlots.mockResolvedValue({ ok: true });
});

describe("WorldInventorySettings (migration 247)", () => {
  it("change le mode d'ajout des objets", async () => {
    const user = userEvent.setup();
    render(<WorldInventorySettings world={monde({ inventory_mode: "free" })} />);
    const mode = screen.getByRole("combobox", { name: "Ajout d'objets" });
    expect(mode).toHaveTextContent("Libre");
    await user.click(mode);
    await user.click(await screen.findByRole("option", { name: /^Tenu/ }));
    await waitFor(() => expect(setWorldInventoryMode).toHaveBeenCalledWith("w1", "held"));
  });

  it("sans limite de départ, ni plafond ni prix", () => {
    render(<WorldInventorySettings world={monde()} />);
    expect(champ("Emplacements de départ")).toHaveValue(0);
    expect(champ("Plafond d'emplacements")).toBeDisabled();
    expect(champ("Prix d'un emplacement")).toBeDisabled();
  });

  it("enregistre départ, plafond et prix ; un champ vide vaut « sans »", async () => {
    const user = userEvent.setup();
    render(<WorldInventorySettings world={monde()} />);
    await user.clear(champ("Emplacements de départ"));
    await user.type(champ("Emplacements de départ"), "10");
    await user.type(champ("Plafond d'emplacements"), "20");
    await user.click(enregistrer());
    await waitFor(() => expect(setWorldInventorySlots).toHaveBeenCalledWith("w1", {
      inventory_slots_default: 10,
      inventory_slots_max: 20,
      inventory_slot_cost: null,
    }));
  });

  it("un plafond sous le nombre de départ ne s'enregistre pas", async () => {
    const user = userEvent.setup();
    render(<WorldInventorySettings world={monde({ inventory_slots_default: 10 })} />);
    await user.type(champ("Plafond d'emplacements"), "5");
    expect(enregistrer()).toBeDisabled();
    expect(screen.getByText("Le plafond ne peut pas être inférieur au nombre de départ.")).toBeInTheDocument();
  });

  it("sans économie, pas de prix", () => {
    render(<WorldInventorySettings world={monde({ enable_economy: false, inventory_slots_default: 10 })} />);
    expect(champ("Plafond d'emplacements")).toBeEnabled();
    expect(champ("Prix d'un emplacement")).toBeDisabled();
  });
});
