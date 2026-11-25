import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const setWorldTax = vi.fn();
vi.mock("@/components/ui/LucideIconPicker", () => ({
  LucideIconPicker: ({ trigger, onChange }: { trigger: React.ReactNode; onChange: (n: string) => void }) => (
    <span>
      {trigger}
      <button type="button" onClick={() => onChange("skull")}>choisir crâne</button>
    </span>
  ),
}));
vi.mock("@/components/ui/LazyLucideIcon", () => ({ LazyLucideIcon: ({ name }: { name: string }) => <svg data-icon={name} /> }));
vi.mock("@/app/actions/worldTax", () => ({
  setWorldTax: (...args: unknown[]) => setWorldTax(...args),
}));

import { WorldTaxSettings } from "@/components/worlds/settings/WorldTaxSettings";
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
    tax_enabled: false,
    tax_amount: 0,
    tax_every: 1,
    tax_unit: "month",
    tax_anchor: "2026-11-01T04:00:00.000Z",
    tax_mode: "manual",
    tax_accumulate: true,
    tax_grace_new: true,
    tax_badge_label: null,
    tax_badge_color: null,
    tax_badge_icon: null,
    ...patch,
  }) as unknown as World;
/** Laisse passer le délai de la sauvegarde automatique. */
const attendre = (ms = 800) => act(() => vi.advanceTimersByTimeAsync(ms));
const utilisateur = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const dernier = () => setWorldTax.mock.calls.at(-1)?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  // shouldAdvanceTime : user-event attend entre deux frappes, le temps doit couler.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setWorldTax.mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

describe("WorldTaxSettings (migration 255)", () => {
  it("pas de bouton : rien ne part tant que rien ne change", async () => {
    render(<WorldTaxSettings world={monde()} />);
    expect(screen.queryByRole("button", { name: /Enregistrer/ })).toBeNull();
    await attendre(2000);
    expect(setWorldTax).not.toHaveBeenCalled();
  });

  it("enregistre d'elle-même, une fois après la saisie : montant, récurrence, paiement, options, badge", async () => {
    const onUpdated = vi.fn();
    const user = utilisateur();
    render(<WorldTaxSettings world={monde()} onUpdated={onUpdated} />);

    await user.click(screen.getByRole("switch", { name: "Lever une taxe" }));
    await user.type(screen.getByRole("spinbutton", { name: "Montant de la taxe en Or" }), "1");
    await user.type(screen.getByRole("spinbutton", { name: "Montant de la taxe en Argent" }), "50");
    const every = screen.getByRole("spinbutton", { name: "Tous les" });
    await user.clear(every);
    await user.type(every, "2");
    await user.selectOptions(screen.getByRole("combobox", { name: "Unité de la récurrence" }), "week");
    await user.selectOptions(screen.getByRole("combobox", { name: "Paiement" }), "auto");
    await user.click(screen.getByRole("switch", { name: "Les dettes s’accumulent" }));
    await user.click(screen.getByRole("switch", { name: "Délai pour les nouveaux personas" }));
    await user.type(screen.getByRole("textbox", { name: "Texte du badge" }), "Mauvais payeur");
    await attendre();

    const attendu = {
      tax_enabled: true,
      tax_amount: 150,
      tax_every: 2,
      tax_unit: "week",
      tax_anchor: "2026-11-01T04:00:00.000Z",
      tax_mode: "auto",
      tax_accumulate: false,
      tax_grace_new: false,
      tax_badge_label: "Mauvais payeur",
      tax_badge_color: null,
      tax_badge_icon: null,
    };
    expect(dernier()).toEqual(attendu);
    expect(onUpdated).toHaveBeenLastCalledWith(attendu);
    expect(screen.getAllByText("Enregistré").length).toBeGreaterThan(0);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("un champ vidé (récurrence) n'est pas envoyé", async () => {
    const user = utilisateur();
    render(<WorldTaxSettings world={monde()} />);
    await user.clear(screen.getByRole("spinbutton", { name: "Tous les" }));
    await attendre();
    expect(setWorldTax).not.toHaveBeenCalled();
  });

  it("un badge vide reprend le texte par défaut", async () => {
    const user = utilisateur();
    render(<WorldTaxSettings world={monde({ tax_badge_label: "Fauché" })} />);
    expect(screen.getByRole("textbox", { name: "Texte du badge" })).toHaveAttribute("placeholder", "Impayé");
    await user.clear(screen.getByRole("textbox", { name: "Texte du badge" }));
    await attendre();
    expect(dernier()).toEqual(expect.objectContaining({ tax_badge_label: null }));
  });

  it("la couleur part à la fermeture du sélecteur, pas pendant qu'on la choisit", async () => {
    const user = utilisateur();
    render(<WorldTaxSettings world={monde({ tax_badge_label: "Fauché" })} />);
    const apercu = screen.getByTestId("tax-badge-preview");
    expect(apercu).toHaveTextContent("Fauché");

    await user.click(screen.getByRole("button", { name: "Choisir une couleur" }));
    await user.click(screen.getByRole("button", { name: "Vert" }));
    // L'aperçu suit tout de suite ; rien n'est envoyé tant que le sélecteur est ouvert.
    expect(apercu.querySelector("[data-tax-overdue]")).toHaveStyle({ color: "#5fcf5a" });
    await attendre(2000);
    expect(setWorldTax).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Choisir une couleur" }));
    await attendre();
    expect(setWorldTax).toHaveBeenCalledTimes(1);
    expect(dernier()).toEqual(expect.objectContaining({ tax_badge_color: "#5fcf5a" }));
  });

  it("l'icône, puis « Style par défaut » : chacun s'enregistre", async () => {
    const user = utilisateur();
    render(<WorldTaxSettings world={monde()} />);
    const apercu = screen.getByTestId("tax-badge-preview");
    await user.click(screen.getByRole("button", { name: "choisir crâne" }));
    expect(apercu.querySelector('[data-icon="skull"]')).not.toBeNull();
    await attendre();
    expect(dernier()).toEqual(expect.objectContaining({ tax_badge_icon: "skull" }));

    await user.click(screen.getByRole("button", { name: "Style par défaut" }));
    await attendre();
    expect(dernier()).toEqual(expect.objectContaining({ tax_badge_color: null, tax_badge_icon: null }));
  });

  it("la date de départ se choisit au calendrier", async () => {
    const user = utilisateur();
    render(<WorldTaxSettings world={monde()} />);
    await user.click(screen.getByRole("button", { name: /^Départ :/ }));
    const jour = screen.getAllByRole("button").find((b) => b.closest("[data-day]") && b.textContent === "15"
      && !b.closest("[data-outside]"))!;
    await user.click(jour);
    await attendre();
    const anchor = new Date(dernier().tax_anchor);
    expect(anchor.getDate()).toBe(15);
    expect(anchor.getMonth()).toBe(10);
    expect(anchor.getHours()).toBe(0);
  });

  it("un refus : un toast, l'indicateur ne dit pas « Enregistré »", async () => {
    setWorldTax.mockResolvedValue({ ok: false, error: "x" });
    const user = utilisateur();
    render(<WorldTaxSettings world={monde()} />);
    await user.click(screen.getByRole("switch", { name: "Lever une taxe" }));
    await attendre();
    expect(toast.error).toHaveBeenCalled();
    expect(screen.queryByText("Enregistré")).toBeNull();
  });
});
