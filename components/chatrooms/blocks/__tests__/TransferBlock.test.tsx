import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { TransferDialog, TransferBlockView } from "@/components/chatrooms/blocks/TransferBlock";
import { createClient } from "@/lib/supabase/client";
import type { usePersonaTransfer } from "@/hooks/usePersonaTransfer";

type Transfer = ReturnType<typeof usePersonaTransfer>;

function transferOf(patch: Partial<Transfer> = {}): Transfer {
  return {
    status: "on",
    units: [
      { name: "Or", short: "po", value: 100 },
      { name: "Argent", short: "pa", value: 1 },
    ],
    economyOn: true,
    inventoryOn: true,
    balance: 450,
    items: [
      {
        id: "i1", catalog_item_id: "c1", name: null, description: null, icon: null, lucide_icon: null,
        quantity: 3, sort_index: 0,
        catalog: { id: "c1", name: "Potion", description: null, icon: null, lucide_icon: null, image_url: null, rarity: null, stackable: true, max_quantity: null, deleted_at: null },
      },
    ],
    recipients: [{ id: "p3", name: "Aria", avatar_url: null, user_id: "u2", is_npc: false }],
    load: vi.fn(async () => {}),
    send: vi.fn(async () => ({ ok: true as const, id: "t1" })),
    ...patch,
  } as Transfer;
}

beforeEach(() => vi.clearAllMocks());

describe("TransferDialog", () => {
  it("charge bourse et objets à l'ouverture", () => {
    const transfer = transferOf();
    render(<TransferDialog open onOpenChange={() => {}} transfer={transfer} chatId="ch1" onSend={() => {}} />);
    expect(transfer.load).toHaveBeenCalled();
    expect(screen.getByText(/^Solde :/)).toHaveTextContent("Solde : 4 po 50 pa");
  });

  it("donne de l'argent et un objet, puis poste le bloc", async () => {
    const user = userEvent.setup();
    const transfer = transferOf();
    const onSend = vi.fn();
    const onOpenChange = vi.fn();
    render(<TransferDialog open onOpenChange={onOpenChange} transfer={transfer} chatId="ch1" onSend={onSend} />);

    const submit = screen.getByRole("button", { name: "Transférer" });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "Aria" }));
    await user.type(screen.getByRole("spinbutton", { name: "Montant en Or" }), "1");
    await user.click(screen.getByRole("checkbox", { name: "Potion" }));
    expect(screen.getByRole("spinbutton", { name: "Quantité de Potion" })).toHaveValue(1);
    await user.click(screen.getByRole("button", { name: "Augmenter : Quantité de Potion" }));

    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(transfer.send).toHaveBeenCalledWith({ to: "p3", amount: 100, items: [{ id: "i1", quantity: 2 }], chatId: "ch1" }),
    );
    expect(onSend).toHaveBeenCalledWith(JSON.stringify({ _type: "transfer", id: "t1" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("refuse un montant au-delà du solde", async () => {
    const user = userEvent.setup();
    render(<TransferDialog open onOpenChange={() => {}} transfer={transferOf()} chatId={null} onSend={() => {}} />);
    await user.click(screen.getByRole("radio", { name: "Aria" }));
    await user.type(screen.getByRole("spinbutton", { name: "Montant en Or" }), "5");
    expect(screen.getByText("Solde insuffisant.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transférer" })).toBeDisabled();
  });

  it("dit le refus de la base sans poster de message", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const transfer = transferOf({ send: vi.fn(async () => ({ ok: false as const, error: "full" as const })) });
    render(<TransferDialog open onOpenChange={() => {}} transfer={transfer} chatId={null} onSend={onSend} />);
    await user.click(screen.getByRole("radio", { name: "Aria" }));
    await user.click(screen.getByRole("checkbox", { name: "Potion" }));
    await user.click(screen.getByRole("button", { name: "Transférer" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("L’inventaire du destinataire est plein."));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sans destinataire possible : le dit", () => {
    render(<TransferDialog open onOpenChange={() => {}} transfer={transferOf({ recipients: [] })} chatId={null} onSend={() => {}} />);
    expect(screen.getByText("Aucun persona à qui donner dans ce monde.")).toBeInTheDocument();
  });
});

describe("TransferBlockView", () => {
  const ROW = {
    id: "t1",
    from_persona_id: "p1",
    to_persona_id: "p3",
    amount: 150,
    items: [{ catalog_item_id: "c1", name: "Potion", icon: null, lucide_icon: null, image_url: null, quantity: 2 }],
    created_at: "2026-11-24T10:00:00Z",
    from: { name: "Brom" },
    to: { name: "Aria" },
    world: { currency_units: [{ name: "Or", short: "po", value: 100 }, { name: "Argent", short: "pa", value: 1 }] },
  };

  it("lit le transfert en base et l'affiche", async () => {
    const mock = createSupabaseMock({ results: [{ data: ROW }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    render(<TransferBlockView id="t1" authorPersonaId="p1" />);
    expect(await screen.findByText("Brom a donné à Aria")).toBeInTheDocument();
    expect(screen.getByText("1 po 50 pa")).toBeInTheDocument();
    expect(screen.getByText("Potion")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("un bloc qui ne désigne pas un transfert de l'auteur du message ne montre rien de faux", async () => {
    const mock = createSupabaseMock({ results: [{ data: ROW }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    render(<TransferBlockView id="t1" authorPersonaId="p9" />);
    expect(await screen.findByText("Transfert introuvable.")).toBeInTheDocument();
    expect(screen.queryByText("Brom a donné à Aria")).toBeNull();
  });
});
