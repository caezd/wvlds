import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  it("le délai suit « Par message » ; les gains de scène, masqués pour l'instant ; le plafond, à part", () => {
    render(<WorldGainsSettings world={monde()} />);
    const gains = screen.getByRole("group", { name: "Ce qui rapporte" });
    const lignes = within(gains)
      .getAllByRole("spinbutton")
      .map((c) => c.getAttribute("aria-label"))
      .filter((n) => !n?.endsWith(" en Or"));
    expect(lignes).toEqual([
      "Par message en Argent",
      "Délai entre deux messages payés (minutes)",
      "Connexion du jour en Argent",
    ]);
    expect(within(gains).queryByRole("spinbutton", { name: "Plafond par jour en Or" })).toBeNull();
    expect(within(screen.getByRole("group", { name: "Plafond par jour" })).getByRole("spinbutton", { name: "Plafond par jour en Or" })).toBeInTheDocument();
  });

  it("chaque gain, palier par palier, avec les montants du monde", () => {
    render(<WorldGainsSettings world={monde()} />);
    expect(champ("Par message en Argent")).toHaveValue(5);
    expect(champ("Délai entre deux messages payés (minutes)")).toHaveValue(2);
    expect(champ("Plafond par jour en Or")).toHaveValue(null);
    expect(enregistrer()).toBeDisabled();
  });

  it("enregistre les montants en unités de base, le plafond vide = sans plafond ; les gains de scène masqués gardent leur valeur", async () => {
    const user = userEvent.setup();
    render(<WorldGainsSettings world={monde()} />);
    await user.type(champ("Connexion du jour en Or"), "1");
    await user.type(champ("Connexion du jour en Argent"), "3");
    await user.click(enregistrer());
    await waitFor(() =>
      expect(setWorldGains).toHaveBeenCalledWith("w1", {
        gain_message: 5,
        gain_scene_joined: 0,
        gain_scene_created: 0,
        gain_scene_completed: 150,
        gain_daily_login: 103,
        gain_message_cooldown: 2,
        gain_daily_cap: null,
      }),
    );
  });

  it("les montants et le délai se règlent aussi aux boutons −/+", async () => {
    const user = userEvent.setup();
    render(<WorldGainsSettings world={monde()} />);
    await user.click(screen.getByRole("button", { name: "Augmenter : Par message en Argent" }));
    await user.click(screen.getByRole("button", { name: "Diminuer : Délai entre deux messages payés (minutes)" }));
    await user.click(enregistrer());
    await waitFor(() =>
      expect(setWorldGains).toHaveBeenCalledWith("w1", expect.objectContaining({ gain_message: 6, gain_message_cooldown: 1 })),
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
