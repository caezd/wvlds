import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
    enable_gains: true,
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
const enregistrer = () => screen.getByRole("button", { name: "Enregistrer les gains" });

beforeEach(() => {
  vi.clearAllMocks();
  setWorldGains.mockResolvedValue({ ok: true });
});

describe("WorldGainsSettings (migration 252)", () => {
  it("chaque gain, palier par palier, avec les montants du monde", () => {
    render(<WorldGainsSettings world={monde()} />);
    expect(champ("Par message en Argent")).toHaveValue(5);
    expect(champ("Par scène terminée en Or")).toHaveValue(1);
    expect(champ("Par scène terminée en Argent")).toHaveValue(50);
    expect(champ("Délai entre deux messages payés (minutes)")).toHaveValue(2);
    expect(champ("Plafond par jour en Or")).toHaveValue(null);
    expect(enregistrer()).toBeDisabled();
  });

  it("enregistre les montants en unités de base, le plafond vide = sans plafond", async () => {
    const user = userEvent.setup();
    render(<WorldGainsSettings world={monde()} />);
    await user.type(champ("Par scène rejointe en Or"), "1");
    await user.type(champ("Connexion du jour en Argent"), "3");
    await user.click(enregistrer());
    await waitFor(() =>
      expect(setWorldGains).toHaveBeenCalledWith("w1", {
        gain_message: 5,
        gain_scene_joined: 100,
        gain_scene_created: 0,
        gain_scene_completed: 150,
        gain_daily_login: 3,
        gain_message_cooldown: 2,
        gain_daily_cap: null,
      }),
    );
  });

  it("un plafond saisi est enregistré", async () => {
    const user = userEvent.setup();
    render(<WorldGainsSettings world={monde()} />);
    await user.type(champ("Plafond par jour en Or"), "2");
    await user.click(enregistrer());
    await waitFor(() => expect(setWorldGains).toHaveBeenCalledWith("w1", expect.objectContaining({ gain_daily_cap: 200 })));
  });

  it("un délai au-delà d'une journée ne s'enregistre pas", async () => {
    const user = userEvent.setup();
    render(<WorldGainsSettings world={monde()} />);
    await user.clear(champ("Délai entre deux messages payés (minutes)"));
    await user.type(champ("Délai entre deux messages payés (minutes)"), "1441");
    expect(enregistrer()).toBeDisabled();
  });
});
