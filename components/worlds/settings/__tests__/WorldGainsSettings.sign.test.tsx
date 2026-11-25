import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const setWorldGains = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/app/actions/worldCatalog", () => ({ setWorldGains: (...a: unknown[]) => setWorldGains(...a) }));

import { WorldGainsSettings } from "@/components/worlds/settings/WorldGainsSettings";
import type { World } from "@/types/worlds";

const monde = (patch: Record<string, unknown> = {}) =>
  ({
    id: "w1",
    name: "Monde",
    enable_economy: true,
    currency_units: [
      { name: "Or", short: "po", value: 100 },
      { name: "Argent", short: "pa", value: 1 },
    ],
    gain_message: -150,
    gain_scene_joined: 0,
    gain_scene_created: 0,
    gain_scene_completed: 0,
    gain_daily_login: 3,
    gain_message_cooldown: 0,
    gain_daily_cap: null,
    ...patch,
  }) as unknown as World;

describe("WorldGainsSettings : gains négatifs (migration 261)", () => {
  it("chaque gain a son sens ; un montant négatif retire, affiché en valeur absolue", () => {
    render(<WorldGainsSettings world={monde()} />);
    const message = screen.getByRole("group", { name: "Par message" });
    expect(within(message).getByRole("switch", { name: "Retirer au lieu de donner : Par message" })).toBeChecked();
    expect(within(message).getByRole("spinbutton", { name: "Par message en Or" })).toHaveValue(1);
    expect(within(message).getByText("Retire de la bourse, jusqu’à zéro")).toBeInTheDocument();

    const connexion = screen.getByRole("group", { name: "Connexion du jour" });
    expect(within(connexion).getByRole("switch", { name: "Retirer au lieu de donner : Connexion du jour" })).not.toBeChecked();
  });

  it("le plafond n'a pas de sens : il reste positif", () => {
    render(<WorldGainsSettings world={monde()} />);
    expect(within(screen.getByRole("group", { name: "Plafond par jour" })).queryByRole("switch")).toBeNull();
  });

  it("les cases n'acceptent que des chiffres : montants et délai", async () => {
    const user = userEvent.setup();
    render(<WorldGainsSettings world={monde({ gain_message: 0 })} />);
    const delai = screen.getByRole("spinbutton", { name: "Délai entre deux messages payés, en minutes" });
    await user.type(delai, "1e-5");
    expect(delai).toHaveValue(15);
    const argent = screen.getByRole("spinbutton", { name: "Par message en Argent" });
    await user.type(argent, "2.5");
    expect(argent).toHaveValue(25);
  });

  it("changer de sens s'enregistre comme toute autre modification", async () => {
    const user = userEvent.setup();
    render(<WorldGainsSettings world={monde()} />);
    await user.click(screen.getByRole("switch", { name: "Retirer au lieu de donner : Par message" }));
    await waitFor(() => expect(setWorldGains).toHaveBeenCalledWith("w1", expect.objectContaining({ gain_message: 150 })), {
      timeout: 2000,
    });
  });
});
