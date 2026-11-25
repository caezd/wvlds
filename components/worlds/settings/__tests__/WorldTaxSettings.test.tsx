import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
const enregistrer = () => screen.getByRole("button", { name: "Enregistrer la taxe" });

beforeEach(() => {
  vi.clearAllMocks();
  setWorldTax.mockResolvedValue({ ok: true });
});

describe("WorldTaxSettings (migration 255)", () => {
  it("rien à enregistrer tant que rien ne change", () => {
    render(<WorldTaxSettings world={monde()} />);
    expect(enregistrer()).toBeDisabled();
  });

  it("règle la taxe : montant, récurrence, paiement, options, badge", async () => {
    const onUpdated = vi.fn();
    render(<WorldTaxSettings world={monde()} onUpdated={onUpdated} />);
    const user = userEvent.setup();

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

    await user.click(enregistrer());
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
    await waitFor(() => expect(setWorldTax).toHaveBeenCalledWith("w1", attendu));
    expect(onUpdated).toHaveBeenCalledWith(attendu);
    expect(enregistrer()).toBeDisabled();
  });

  it("un badge vide reprend le texte par défaut", async () => {
    render(<WorldTaxSettings world={monde({ tax_badge_label: "Fauché" })} />);
    const user = userEvent.setup();
    expect(screen.getByRole("textbox", { name: "Texte du badge" })).toHaveAttribute("placeholder", "Impayé");
    await user.clear(screen.getByRole("textbox", { name: "Texte du badge" }));
    await user.click(enregistrer());
    await waitFor(() =>
      expect(setWorldTax).toHaveBeenCalledWith("w1", expect.objectContaining({ tax_badge_label: null })),
    );
  });

  it("le badge se personnalise : couleur, icône, aperçu ; « Par défaut » les retire", async () => {
    render(<WorldTaxSettings world={monde({ tax_badge_label: "Fauché" })} />);
    const user = userEvent.setup();
    const apercu = screen.getByTestId("tax-badge-preview");
    expect(apercu).toHaveTextContent("Fauché");

    await user.click(screen.getByRole("button", { name: "Choisir une couleur" }));
    await user.click(screen.getByRole("button", { name: "Vert" }));
    await user.click(screen.getByRole("button", { name: "choisir crâne" }));
    expect(apercu.querySelector('[data-icon="skull"]')).not.toBeNull();
    expect(apercu.querySelector("[data-tax-overdue]")).toHaveStyle({ color: "#5fcf5a" });

    await user.click(enregistrer());
    await waitFor(() =>
      expect(setWorldTax).toHaveBeenLastCalledWith("w1", expect.objectContaining({ tax_badge_color: "#5fcf5a", tax_badge_icon: "skull" })),
    );

    await user.click(screen.getByRole("button", { name: "Style par défaut" }));
    await user.click(enregistrer());
    await waitFor(() =>
      expect(setWorldTax).toHaveBeenLastCalledWith("w1", expect.objectContaining({ tax_badge_color: null, tax_badge_icon: null })),
    );
  });

  it("la date de départ se choisit au calendrier", async () => {
    render(<WorldTaxSettings world={monde()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Départ :/ }));
    const jour = screen.getAllByRole("button").find((b) => b.closest("[data-day]") && b.textContent === "15"
      && !b.closest("[data-outside]"))!;
    await user.click(jour);
    await user.click(enregistrer());
    await waitFor(() => expect(setWorldTax).toHaveBeenCalled());
    const anchor = new Date(setWorldTax.mock.calls[0][1].tax_anchor);
    expect(anchor.getDate()).toBe(15);
    expect(anchor.getMonth()).toBe(10);
    expect(anchor.getHours()).toBe(0);
  });
});
