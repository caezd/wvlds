import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PersonaWalletSection, formatMovementDate } from "@/components/personas/PersonaWalletSection";
import type { WalletMovement } from "@/hooks/usePersonaWallet";

const UNITS = [
  { name: "Argent", short: "pa", value: 100 },
  { name: "Cuivre", short: "pc", value: 1 },
];
const mouvement = (id: string, delta: number, note: string | null = null): WalletMovement => ({
  id, delta, balance_after: 0, kind: "adjust", note, created_at: "2026-11-24T10:00:00Z",
});

const adjust = vi.fn();
const wallet = (over: Partial<Parameters<typeof PersonaWalletSection>[0]["wallet"]> = {}) => ({
  status: "on" as const,
  units: UNITS,
  balance: 523,
  ledger: [] as WalletMovement[],
  adjust,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  adjust.mockResolvedValue({ ok: true });
});

describe("PersonaWalletSection (migration 246)", () => {
  it("montre le solde décomposé en paliers", () => {
    render(<PersonaWalletSection personaName="Lia" wallet={wallet()} canManage={false} />);
    expect(screen.getByTestId("persona-wallet-balance")).toHaveTextContent("5 pa 23 pc");
  });

  it("sans la permission, pas d'ajustement", () => {
    render(<PersonaWalletSection personaName="Lia" wallet={wallet()} canManage={false} />);
    expect(screen.queryByRole("button", { name: "Ajuster" })).toBeNull();
  });

  it("liste les mouvements, signés, avec leur nature et, s'il y en a un, leur motif", () => {
    render(
      <PersonaWalletSection
        personaName="Lia"
        wallet={wallet({ ledger: [mouvement("m1", 500, "Quête"), mouvement("m2", -23)] })}
        canManage={false}
      />,
    );
    const items = within(screen.getByRole("list", { name: "Mouvements" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("+5 pa");
    expect(items[0]).toHaveTextContent("Ajustement");
    expect(items[0]).toHaveTextContent("Quête");
    expect(items[1]).toHaveTextContent("−23 pc");
    expect(items[1]).toHaveTextContent("Ajustement");
  });

  it("sans mouvement, le dit", () => {
    render(<PersonaWalletSection personaName="Lia" wallet={wallet()} canManage={false} />);
    expect(screen.getByText("Aucun mouvement.")).toBeInTheDocument();
  });

  it("débite un montant saisi par palier, avec son motif", async () => {
    const user = userEvent.setup();
    render(<PersonaWalletSection personaName="Lia" wallet={wallet()} canManage />);
    await user.click(screen.getByRole("button", { name: "Ajuster" }));
    const dialog = await screen.findByRole("dialog", { name: "Ajuster la bourse de Lia" });
    const valider = within(dialog).getByRole("button", { name: "Valider" });
    expect(valider).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "Débiter" }));
    await user.type(within(dialog).getByRole("spinbutton", { name: "Montant en Argent" }), "2");
    await user.type(within(dialog).getByRole("spinbutton", { name: "Montant en Cuivre" }), "50");
    await user.type(within(dialog).getByRole("textbox", { name: "Motif" }), "Amende");
    await user.click(valider);

    await waitFor(() => expect(adjust).toHaveBeenCalledWith(-250, "Amende"));
    expect(toast.success).toHaveBeenCalledWith("Bourse mise à jour.");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("le montant se saisit aussi avec les boutons −/+ de chaque palier", async () => {
    const user = userEvent.setup();
    render(<PersonaWalletSection personaName="Lia" wallet={wallet()} canManage />);
    await user.click(screen.getByRole("button", { name: "Ajuster" }));
    const dialog = await screen.findByRole("dialog", { name: "Ajuster la bourse de Lia" });
    const plus = within(dialog).getByRole("button", { name: "Augmenter : Montant en Argent" });
    await user.click(plus);
    await user.click(plus);
    await user.click(within(dialog).getByRole("button", { name: "Valider" }));
    await waitFor(() => expect(adjust).toHaveBeenCalledWith(200, ""));
  });

  it("un transfert se lit « Transfert » dans les mouvements", () => {
    render(
      <PersonaWalletSection
        personaName="Lia"
        wallet={wallet({ ledger: [{ ...mouvement("m1", -100), kind: "transfer" }] })}
        canManage={false}
      />,
    );
    expect(within(screen.getByRole("list", { name: "Mouvements" })).getByText("Transfert")).toBeInTheDocument();
  });

  it("un solde insuffisant est signalé, le dialogue reste ouvert", async () => {
    adjust.mockResolvedValue({ ok: false, error: "insufficient" });
    const user = userEvent.setup();
    render(<PersonaWalletSection personaName="Lia" wallet={wallet()} canManage />);
    await user.click(screen.getByRole("button", { name: "Ajuster" }));
    const dialog = await screen.findByRole("dialog", { name: "Ajuster la bourse de Lia" });
    await user.click(within(dialog).getByRole("button", { name: "Débiter" }));
    await user.type(within(dialog).getByRole("spinbutton", { name: "Montant en Argent" }), "9");
    await user.click(within(dialog).getByRole("button", { name: "Valider" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Solde insuffisant."));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("un achat dit « Achat », l'article et la boutique en détail", () => {
    render(
      <PersonaWalletSection
        personaName="Lia"
        wallet={wallet({ ledger: [{ ...mouvement("m1", -250, "Épée ×2 · Comptoir"), kind: "purchase" }] })}
        canManage={false}
      />,
    );
    const item = within(screen.getByRole("list", { name: "Mouvements" })).getByRole("listitem");
    expect(within(item).getByText("Achat")).toBeInTheDocument();
    expect(within(item).getByText("Épée ×2 · Comptoir")).toBeInTheDocument();
  });

  it("chaque mouvement porte sa date et son heure, la date complète au survol", () => {
    render(
      <PersonaWalletSection personaName="Lia" wallet={wallet({ ledger: [mouvement("m1", 5)] })} canManage={false} />,
    );
    const quand = within(screen.getByRole("list", { name: "Mouvements" })).getByText(
      formatMovementDate("2026-11-24T10:00:00Z", "fr"),
    );
    expect(quand.tagName).toBe("TIME");
    expect(quand).toHaveAttribute("datetime", "2026-11-24T10:00:00Z");
    expect(quand).toHaveAttribute(
      "title",
      new Date("2026-11-24T10:00:00Z").toLocaleString("fr", { dateStyle: "full", timeStyle: "short" }),
    );
  });

  it("la date d'un mouvement : sans l'année quand c'est l'année en cours", () => {
    const maintenant = new Date("2026-11-25T12:00:00Z");
    const iso = "2026-03-04T10:00:00Z";
    const heure = new Date(iso).toLocaleTimeString("fr", { hour: "2-digit", minute: "2-digit" });
    expect(formatMovementDate(iso, "fr", maintenant)).toMatch(/^4 mars/);
    expect(formatMovementDate(iso, "fr", maintenant)).not.toMatch(/2026/);
    expect(formatMovementDate(iso, "fr", maintenant)).toContain(heure);
    expect(formatMovementDate("2025-03-04T10:00:00Z", "fr", maintenant)).toMatch(/2025/);
  });

  it("« Voir plus » charge les mouvements plus anciens, quand il en reste", async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { rerender } = render(
      <PersonaWalletSection
        personaName="Lia"
        wallet={wallet({ ledger: [mouvement("m1", 5)], hasMore: true, loadMore })}
        canManage={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Voir plus" }));
    expect(loadMore).toHaveBeenCalledTimes(1);

    rerender(
      <PersonaWalletSection
        personaName="Lia"
        wallet={wallet({ ledger: [mouvement("m1", 5)], hasMore: false, loadMore })}
        canManage={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Voir plus" })).toBeNull();
  });
});
