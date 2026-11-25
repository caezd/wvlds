import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/actions/worldCatalog", () => ({ setWorldGains: vi.fn() }));

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
    expect(within(message).getByRole("radio", { name: "Retire" })).toBeChecked();
    expect(within(message).getByRole("spinbutton", { name: "Par message en Or" })).toHaveValue(1);
    expect(within(message).getByText("Retire de la bourse, jusqu’à zéro")).toBeInTheDocument();

    const connexion = screen.getByRole("group", { name: "Connexion du jour" });
    expect(within(connexion).getByRole("radio", { name: "Donne" })).toBeChecked();
  });

  it("le plafond n'a pas de sens : il reste positif", () => {
    render(<WorldGainsSettings world={monde()} />);
    expect(within(screen.getByRole("group", { name: "Plafond par jour" })).queryByRole("radio")).toBeNull();
  });
});
