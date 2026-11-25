import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const setWorldGains = vi.fn();
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldGains: (...args: unknown[]) => setWorldGains(...args),
}));

import { WorldGainsSettings } from "@/components/worlds/settings/WorldGainsSettings";
import type { World } from "@/types/worlds";

const UNITS = [
  { name: "Or", short: "po", value: 100 },
  { name: "Argent", short: "pa", value: 1 },
];
const monde = (patch: Record<string, unknown> = {}) =>
  ({
    id: "w1",
    name: "Monde",
    enable_economy: true,
    currency_units: UNITS,
    gain_message: 5,
    gain_scene_joined: 0,
    gain_scene_created: 0,
    gain_scene_completed: 150,
    gain_daily_login: 0,
    gain_message_cooldown: 2,
    gain_daily_cap: null,
    ...patch,
  }) as unknown as World;
const champ = (name: string) => screen.getByRole("spinbutton", { name });
/** Laisse passer le délai de la sauvegarde automatique. */
const attendre = (ms = 800) => act(() => vi.advanceTimersByTimeAsync(ms));
const utilisateur = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

beforeEach(() => {
  vi.clearAllMocks();
  // shouldAdvanceTime : user-event attend entre deux frappes, le temps doit couler.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setWorldGains.mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

describe("WorldGainsSettings (migration 252)", () => {
  it("ce qui rapporte, puis les limites (délai, plafond) ; les gains de scène, masqués pour l'instant", () => {
    render(<WorldGainsSettings world={monde()} />);
    const noms = (section: string) =>
      within(screen.getByRole("region", { name: section }))
        .getAllByRole("spinbutton")
        .map((c) => c.getAttribute("aria-label"))
        .filter((n) => !n?.endsWith(" en Or"));
    expect(noms("Gains")).toEqual(["Par message en Argent", "Connexion du jour en Argent"]);
    expect(noms("Limites des gains")).toEqual(["Délai entre deux messages payés, en minutes", "Plafond par jour en Argent"]);
  });

  it("dit ce que veut dire un champ vide : rien, aucun délai, sans plafond", () => {
    render(<WorldGainsSettings world={monde({ gain_message_cooldown: 0 })} />);
    expect(screen.getAllByText("Ne rapporte rien")).toHaveLength(1); // Connexion du jour
    expect(screen.getByText("Aucun délai : chaque message est payé")).toBeInTheDocument();
    expect(screen.getByText("Sans plafond")).toBeInTheDocument();
  });

  it("prévient qu'un plafond à zéro bloque tous les gains", () => {
    render(<WorldGainsSettings world={monde({ gain_daily_cap: 0 })} />);
    expect(screen.getByText("Plafond à zéro : plus aucun gain n’est versé")).toBeInTheDocument();
  });

  it("chaque gain, palier par palier, avec les montants du monde", () => {
    render(<WorldGainsSettings world={monde()} />);
    expect(champ("Par message en Argent")).toHaveValue(5);
    expect(champ("Délai entre deux messages payés, en minutes")).toHaveValue(2);
    expect(champ("Plafond par jour en Or")).toHaveValue(null);
  });

  it("enregistre d'elle-même, une fois, les montants en unités de base ; le plafond vide = sans plafond ; les gains de scène masqués gardent leur valeur", async () => {
    const user = utilisateur();
    render(<WorldGainsSettings world={monde()} />);
    await user.type(champ("Connexion du jour en Argent"), "13");
    expect(setWorldGains).not.toHaveBeenCalled();
    await attendre();
    expect(setWorldGains).toHaveBeenCalledTimes(1);
    expect(setWorldGains).toHaveBeenCalledWith("w1", {
      gain_message: 5,
      gain_scene_joined: 0,
      gain_scene_created: 0,
      gain_scene_completed: 150,
      gain_daily_login: 13,
      gain_message_cooldown: 2,
      gain_daily_cap: null,
    });
    expect(toast.success).toHaveBeenCalledWith("Enregistré", { id: "autosave" });
  });

  it("enregistre tout de suite quand le champ perd le focus", async () => {
    const user = utilisateur();
    render(<WorldGainsSettings world={monde()} />);
    await user.type(champ("Par message en Argent"), "0");
    await user.tab();
    expect(setWorldGains).toHaveBeenCalledWith("w1", expect.objectContaining({ gain_message: 50 }));
  });

  it("un échec le signale", async () => {
    setWorldGains.mockResolvedValue({ ok: false, error: "boom" });
    const user = utilisateur();
    render(<WorldGainsSettings world={monde()} />);
    await user.type(champ("Plafond par jour en Or"), "2");
    await attendre();
    expect(toast.error).toHaveBeenCalled();
  });

  it("un délai vidé vaut zéro", async () => {
    const user = utilisateur();
    render(<WorldGainsSettings world={monde()} />);
    await user.clear(champ("Délai entre deux messages payés, en minutes"));
    await attendre();
    expect(setWorldGains).toHaveBeenCalledWith("w1", expect.objectContaining({ gain_message_cooldown: 0 }));
  });

  it("un plafond saisi est enregistré", async () => {
    const user = utilisateur();
    render(<WorldGainsSettings world={monde()} />);
    await user.type(champ("Plafond par jour en Or"), "2");
    await attendre();
    expect(setWorldGains).toHaveBeenCalledWith("w1", expect.objectContaining({ gain_daily_cap: 200 }));
  });

  it("un délai au-delà d'une journée ne s'enregistre pas", async () => {
    const user = utilisateur();
    render(<WorldGainsSettings world={monde()} />);
    await user.clear(champ("Délai entre deux messages payés, en minutes"));
    await user.type(champ("Délai entre deux messages payés, en minutes"), "1441");
    await attendre();
    expect(setWorldGains).not.toHaveBeenCalled();
    expect(screen.getByText(/délai d’une journée au plus/)).toBeInTheDocument();
  });
});
