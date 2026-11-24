import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const setWorldCurrency = vi.fn();
vi.mock("@/app/actions/worldCatalog", () => ({
  setWorldCurrency: (...args: unknown[]) => setWorldCurrency(...args),
}));

import { WorldCurrencySettings } from "@/components/worlds/settings/WorldCurrencySettings";
import type { World } from "@/types/worlds";

const OR = [
  { name: "Or", short: "po", value: 10_000 },
  { name: "Argent", short: "pa", value: 100 },
  { name: "Cuivre", short: "pc", value: 1 },
];
const monde = (patch: Partial<World> = {}) => ({ id: "w1", name: "Monde", currency_units: OR, ...patch }) as World;
const enregistrer = () => screen.getByRole("button", { name: "Enregistrer la monnaie" });

beforeEach(() => {
  vi.clearAllMocks();
  setWorldCurrency.mockResolvedValue({ ok: true });
});

describe("WorldCurrencySettings (migration 246)", () => {
  it("montre les paliers, chacun en nombre du suivant, et un exemple de conversion", () => {
    render(<WorldCurrencySettings world={monde()} />);
    expect(screen.getByRole("textbox", { name: "Nom du palier 1" })).toHaveValue("Or");
    expect(screen.getByRole("textbox", { name: "Abréviation du palier 1" })).toHaveValue("po");
    expect(screen.getByRole("spinbutton", { name: "Or en Argent" })).toHaveValue(100);
    expect(screen.getByRole("spinbutton", { name: "Argent en Cuivre" })).toHaveValue(100);
    // L'unité de base n'a pas de taux.
    expect(screen.queryByRole("spinbutton", { name: /^Cuivre en/ })).toBeNull();
    expect(screen.getByText("500 pc = 5 pa")).toBeInTheDocument();
    expect(enregistrer()).toBeDisabled();
  });

  it("enregistre les valeurs absolues tirées des taux", async () => {
    const user = userEvent.setup();
    render(<WorldCurrencySettings world={monde()} />);
    const taux = screen.getByRole("spinbutton", { name: "Or en Argent" });
    await user.clear(taux);
    await user.type(taux, "10");
    await user.click(enregistrer());
    await waitFor(() => expect(setWorldCurrency).toHaveBeenCalledWith("w1", [
      { name: "Or", short: "po", value: 1_000 },
      { name: "Argent", short: "pa", value: 100 },
      { name: "Cuivre", short: "pc", value: 1 },
    ]));
  });

  it("ajoute un palier au-dessus des autres, à nommer avant d'enregistrer", async () => {
    const user = userEvent.setup();
    render(<WorldCurrencySettings world={monde()} />);
    await user.click(screen.getByRole("button", { name: "Ajouter un palier" }));
    const nom = screen.getByRole("textbox", { name: "Nom du palier 1" });
    expect(nom).toHaveValue("");
    expect(enregistrer()).toBeDisabled();
    await user.type(nom, "Platine");
    await user.click(enregistrer());
    await waitFor(() => expect(setWorldCurrency).toHaveBeenCalledWith("w1", [
      { name: "Platine", short: "", value: 100_000 },
      ...OR,
    ]));
  });

  it("le dernier palier restant ne se retire pas", () => {
    render(<WorldCurrencySettings world={monde({ currency_units: [{ name: "Pièce", short: "", value: 1 }] })} />);
    expect(screen.getByRole("button", { name: "Retirer Pièce" })).toBeDisabled();
  });

  it("retirer l'unité de base fait du palier du dessus la nouvelle base", async () => {
    const user = userEvent.setup();
    render(<WorldCurrencySettings world={monde()} />);
    await user.click(screen.getByRole("button", { name: "Retirer Cuivre" }));
    await user.click(enregistrer());
    await waitFor(() => expect(setWorldCurrency).toHaveBeenCalledWith("w1", [
      { name: "Or", short: "po", value: 100 },
      { name: "Argent", short: "pa", value: 1 },
    ]));
  });

  it("un échec le signale et garde la saisie", async () => {
    setWorldCurrency.mockResolvedValue({ ok: false, error: "boom" });
    const user = userEvent.setup();
    render(<WorldCurrencySettings world={monde()} />);
    await user.clear(screen.getByRole("textbox", { name: "Nom du palier 1" }));
    await user.type(screen.getByRole("textbox", { name: "Nom du palier 1" }), "Écu");
    await user.click(enregistrer());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole("textbox", { name: "Nom du palier 1" })).toHaveValue("Écu");
  });
});
