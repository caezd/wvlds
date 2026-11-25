import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PersonaTaxSection, type PersonaTax } from "@/components/personas/PersonaTaxSection";
import { taxSettingsOf } from "@/lib/worldTax";

const UNITS = [
  { name: "Or", short: "po", value: 100 },
  { name: "Cuivre", short: "pc", value: 1 },
];
const PASSE = { id: "d1", period_start: "2026-01-01T00:00:00Z", period_end: "2026-02-01T00:00:00Z", amount: 150 };
const EN_COURS = { id: "d2", period_start: "2026-02-01T00:00:00Z", period_end: "2999-01-01T00:00:00Z", amount: 150 };

const pay = vi.fn();
const waive = vi.fn();
const taxe = (over: Partial<PersonaTax> = {}): PersonaTax => ({
  status: "on",
  settings: taxSettingsOf({ tax_enabled: true, tax_amount: 150, tax_every: 1, tax_unit: "month", tax_mode: "manual" }),
  dues: [EN_COURS],
  pay,
  waive,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  pay.mockResolvedValue({ ok: true });
  waive.mockResolvedValue(true);
});

describe("PersonaTaxSection (migration 255)", () => {
  it("le montant, la récurrence, ce qui reste à payer", () => {
    render(<PersonaTaxSection tax={taxe()} units={UNITS} canPay canManage={false} />);
    expect(screen.getByText("1 po 50 pc par mois")).toBeInTheDocument();
    expect(screen.getByText("À payer : 1 po 50 pc")).toBeInTheDocument();
  });

  it("à jour : rien à payer, pas de bouton", () => {
    render(<PersonaTaxSection tax={taxe({ dues: [] })} units={UNITS} canPay canManage />);
    expect(screen.getByText("À jour")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("en retard : les périodes échues et leur total", () => {
    render(<PersonaTaxSection tax={taxe({ dues: [PASSE, EN_COURS] })} units={UNITS} canPay={false} canManage={false} />);
    expect(screen.getByText("En retard : 1 période, 1 po 50 pc")).toBeInTheDocument();
  });

  it("le joueur paie ; un solde trop maigre l'en informe", async () => {
    const onPaid = vi.fn();
    render(<PersonaTaxSection tax={taxe()} units={UNITS} canPay canManage={false} onPaid={onPaid} />);
    await userEvent.click(screen.getByRole("button", { name: "Payer la taxe" }));
    expect(pay).toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Taxe payée."));
    expect(onPaid).toHaveBeenCalled();

    pay.mockResolvedValue({ ok: false, error: "insufficient" });
    await userEvent.click(screen.getByRole("button", { name: "Payer la taxe" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Solde insuffisant."));
  });

  it("retrait automatique : pas de bouton pour le joueur", () => {
    const settings = taxSettingsOf({ tax_enabled: true, tax_amount: 150, tax_mode: "auto" });
    render(<PersonaTaxSection tax={taxe({ settings })} units={UNITS} canPay canManage={false} />);
    expect(screen.getByText("Prélevée automatiquement dès que la bourse le permet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Payer la taxe" })).toBeNull();
  });

  it("qui gère l'économie annule une dette échue", async () => {
    render(<PersonaTaxSection tax={taxe({ dues: [PASSE] })} units={UNITS} canPay={false} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Annuler la dette" }));
    expect(waive).toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Dette annulée."));
  });

  it("rien quand la taxe est coupée", () => {
    const { container } = render(<PersonaTaxSection tax={taxe({ status: "off" })} units={UNITS} canPay canManage />);
    expect(container).toBeEmptyDOMElement();
  });
});
