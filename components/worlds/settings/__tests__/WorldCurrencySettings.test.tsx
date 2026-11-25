import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
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
/** Laisse passer le délai de la sauvegarde automatique. */
const attendre = (ms = 800) => act(() => vi.advanceTimersByTimeAsync(ms));
const utilisateur = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

beforeEach(() => {
  vi.clearAllMocks();
  // shouldAdvanceTime : user-event attend entre deux frappes, le temps doit couler.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setWorldCurrency.mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

describe("WorldCurrencySettings (migration 246)", () => {
  it("montre les paliers, chacun en nombre du suivant", () => {
    render(<WorldCurrencySettings world={monde()} />);
    expect(screen.getByRole("textbox", { name: "Nom du palier 1" })).toHaveValue("Or");
    expect(screen.getByRole("textbox", { name: "Abréviation du palier 1" })).toHaveValue("po");
    expect(screen.getByRole("spinbutton", { name: "Or en Argent" })).toHaveValue(100);
    expect(screen.getByRole("spinbutton", { name: "Argent en Cuivre" })).toHaveValue(100);
    // L'unité de base n'a pas de taux.
    expect(screen.queryByRole("spinbutton", { name: /^Cuivre en/ })).toBeNull();
  });

  it("l'aperçu montre un montant d'exemple et la chaîne de conversion", () => {
    render(<WorldCurrencySettings world={monde()} />);
    const apercu = screen.getByTestId("currency-preview");
    expect(within(apercu).getByText("Aperçu de la monnaie")).toBeInTheDocument();
    // Cinq fois le deuxième plus petit palier, plus trois unités de base.
    expect(within(apercu).getByTestId("currency-preview-amount")).toHaveTextContent("5 pa 3 pc");
    expect(within(apercu).getByText("1 Or = 100 Argent · 1 Argent = 100 Cuivre")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Paliers" })).toBeInTheDocument();
  });

  it("l'aperçu suit la saisie, et garde la dernière valeur valide quand elle ne l'est plus", async () => {
    const user = utilisateur();
    render(<WorldCurrencySettings world={monde()} />);
    const montant = () => screen.getByTestId("currency-preview-amount");
    const taux = screen.getByRole("spinbutton", { name: "Argent en Cuivre" });
    await user.clear(taux);
    await user.type(taux, "10");
    expect(montant()).toHaveTextContent("5 pa 3 pc");
    expect(screen.getByText("1 Or = 100 Argent · 1 Argent = 10 Cuivre")).toBeInTheDocument();
    // Un taux de 1 n'est pas valide : l'aperçu reste sur la dernière saisie valide.
    await user.clear(taux);
    await user.type(taux, "1");
    expect(montant()).toHaveTextContent("5 pa 3 pc");
    expect(screen.getByText("1 Or = 100 Argent · 1 Argent = 10 Cuivre")).toBeInTheDocument();
  });

  it("une seule unité : l'aperçu montre un montant sans conversion", () => {
    render(<WorldCurrencySettings world={monde({ currency_units: [{ name: "Pièce", short: "", value: 1 }] })} />);
    expect(screen.getByTestId("currency-preview-amount")).toHaveTextContent("5 Pièce");
  });

  it("enregistre d'elle-même, une fois, les valeurs absolues tirées des taux, après le délai", async () => {
    const user = utilisateur();
    render(<WorldCurrencySettings world={monde()} />);
    const taux = screen.getByRole("spinbutton", { name: "Or en Argent" });
    await user.clear(taux);
    await user.type(taux, "10");
    await attendre(500);
    expect(setWorldCurrency).not.toHaveBeenCalled();
    await attendre(300);
    expect(setWorldCurrency).toHaveBeenCalledTimes(1);
    expect(setWorldCurrency).toHaveBeenCalledWith("w1", [
      { name: "Or", short: "po", value: 1_000 },
      { name: "Argent", short: "pa", value: 100 },
      { name: "Cuivre", short: "pc", value: 1 },
    ]);
    expect(toast.success).toHaveBeenCalledWith("Enregistré", { id: "autosave" });
  });

  it("enregistre tout de suite quand le champ perd le focus", async () => {
    const user = utilisateur();
    render(<WorldCurrencySettings world={monde()} />);
    await user.type(screen.getByRole("textbox", { name: "Abréviation du palier 1" }), "x");
    await user.tab();
    expect(setWorldCurrency).toHaveBeenCalledWith("w1", expect.arrayContaining([{ name: "Or", short: "pox", value: 10_000 }]));
  });

  it("ajoute un palier au-dessus des autres, enregistré une fois nommé", async () => {
    const user = utilisateur();
    render(<WorldCurrencySettings world={monde()} />);
    await user.click(screen.getByRole("button", { name: "Ajouter un palier" }));
    const nom = screen.getByRole("textbox", { name: "Nom du palier 1" });
    expect(nom).toHaveValue("");
    await attendre();
    expect(setWorldCurrency).not.toHaveBeenCalled();
    expect(screen.getByText(/Chaque palier doit porter un nom/)).toBeInTheDocument();
    await user.type(nom, "Platine");
    await attendre();
    expect(setWorldCurrency).toHaveBeenCalledWith("w1", [{ name: "Platine", short: "", value: 100_000 }, ...OR]);
  });

  it("le dernier palier restant ne se retire pas", () => {
    render(<WorldCurrencySettings world={monde({ currency_units: [{ name: "Pièce", short: "", value: 1 }] })} />);
    expect(screen.getByRole("button", { name: "Retirer Pièce" })).toBeDisabled();
  });

  it("retirer l'unité de base fait du palier du dessus la nouvelle base", async () => {
    const user = utilisateur();
    render(<WorldCurrencySettings world={monde()} />);
    await user.click(screen.getByRole("button", { name: "Retirer Cuivre" }));
    await attendre();
    expect(setWorldCurrency).toHaveBeenCalledWith("w1", [
      { name: "Or", short: "po", value: 100 },
      { name: "Argent", short: "pa", value: 1 },
    ]);
  });

  it("un échec le signale et garde la saisie", async () => {
    setWorldCurrency.mockResolvedValue({ ok: false, error: "boom" });
    const user = utilisateur();
    render(<WorldCurrencySettings world={monde()} />);
    await user.clear(screen.getByRole("textbox", { name: "Nom du palier 1" }));
    await user.type(screen.getByRole("textbox", { name: "Nom du palier 1" }), "Écu");
    await attendre();
    expect(toast.error).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Nom du palier 1" })).toHaveValue("Écu");
  });
});
