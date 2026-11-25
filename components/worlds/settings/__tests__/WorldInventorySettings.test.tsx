import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

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
/** Laisse passer le délai de la sauvegarde automatique. */
const attendre = (ms = 800) => act(() => vi.advanceTimersByTimeAsync(ms));
const utilisateur = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

beforeEach(() => {
  vi.clearAllMocks();
  // shouldAdvanceTime : user-event attend entre deux frappes, le temps doit couler.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setWorldInventoryMode.mockResolvedValue({ ok: true });
  setWorldInventorySlots.mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

describe("WorldInventorySettings (migration 247)", () => {
  it("change le mode d'ajout des objets", async () => {
    const user = utilisateur();
    render(<WorldInventorySettings world={monde({ inventory_mode: "free" })} />);
    const modes = screen.getByRole("radiogroup", { name: "Ajout d'objets" });
    expect(within(modes).getAllByRole("radio")).toHaveLength(3);
    expect(within(modes).getByRole("radio", { name: /^Libre/ })).toBeChecked();
    // Chaque option dit ce qu'elle permet, en clair.
    expect(within(modes).getByText("Objets donnés, achetés ou échangés")).toBeInTheDocument();
    await user.click(within(modes).getByRole("radio", { name: /^Tenu/ }));
    await waitFor(() => expect(setWorldInventoryMode).toHaveBeenCalledWith("w1", "held"));
    expect(within(modes).getByRole("radio", { name: /^Tenu/ })).toBeChecked();
  });

  it("sans limite de départ, ni plafond ni prix", () => {
    render(<WorldInventorySettings world={monde()} />);
    expect(champ("Emplacements de départ")).toHaveValue(0);
    expect(champ("Plafond d'emplacements")).toBeDisabled();
    expect(champ("Prix d'un emplacement")).toBeDisabled();
  });

  it("enregistre d'elle-même départ, plafond et prix après le délai ; un champ vide vaut « sans »", async () => {
    const user = utilisateur();
    render(<WorldInventorySettings world={monde()} />);
    const depart = champ("Emplacements de départ");
    await user.clear(depart);
    await user.type(depart, "10");
    await attendre();
    expect(setWorldInventorySlots).toHaveBeenLastCalledWith("w1", {
      inventory_slots_default: 10,
      inventory_slots_max: null,
      inventory_slot_cost: null,
    });
    expect(toast.success).toHaveBeenCalledWith("Enregistré", { id: "autosave" });
    await user.type(champ("Plafond d'emplacements"), "20");
    await attendre();
    expect(setWorldInventorySlots).toHaveBeenLastCalledWith("w1", {
      inventory_slots_default: 10,
      inventory_slots_max: 20,
      inventory_slot_cost: null,
    });
    expect(toast.success).toHaveBeenCalledTimes(2);
  });

  it("enregistre tout de suite quand le champ perd le focus", async () => {
    const user = utilisateur();
    render(<WorldInventorySettings world={monde({ inventory_slots_default: 10 })} />);
    await user.type(champ("Plafond d'emplacements"), "30");
    await user.tab();
    expect(setWorldInventorySlots).toHaveBeenCalledWith("w1", expect.objectContaining({ inventory_slots_max: 30 }));
  });

  it("un plafond sous le nombre de départ ne s'enregistre pas", async () => {
    const user = utilisateur();
    render(<WorldInventorySettings world={monde({ inventory_slots_default: 10 })} />);
    await user.type(champ("Plafond d'emplacements"), "5");
    await attendre();
    expect(setWorldInventorySlots).not.toHaveBeenCalled();
    expect(screen.getByText("Le plafond ne peut pas être inférieur au nombre de départ.")).toBeInTheDocument();
  });

  it("un échec le signale", async () => {
    setWorldInventorySlots.mockResolvedValue({ ok: false, error: "boom" });
    const user = utilisateur();
    render(<WorldInventorySettings world={monde({ inventory_slots_default: 10 })} />);
    await user.type(champ("Plafond d'emplacements"), "30");
    await attendre();
    expect(toast.error).toHaveBeenCalled();
  });

  it("sans économie, pas de prix", () => {
    render(<WorldInventorySettings world={monde({ enable_economy: false, inventory_slots_default: 10 })} />);
    expect(champ("Plafond d'emplacements")).toBeEnabled();
    expect(champ("Prix d'un emplacement")).toBeDisabled();
  });
});
