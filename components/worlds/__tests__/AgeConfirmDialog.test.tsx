import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const birth = vi.fn();
vi.mock("@/hooks/useMyBirthDate", () => ({ useMyBirthDate: () => birth() }));

import { AgeConfirmDialog } from "@/components/worlds/AgeConfirmDialog";

beforeEach(() => vi.clearAllMocks());

function renderDialog() {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(<AgeConfirmDialog worldName="Nuit" open onOpenChange={onOpenChange} onConfirm={onConfirm} />);
  return { onConfirm, onOpenChange };
}

describe("AgeConfirmDialog avec la date de naissance du compte (migration 266)", () => {
  it("majeur connu : confirme sans rien demander", async () => {
    birth.mockReturnValue({ status: "adult", birthDate: "1990-06-15" });
    const { onConfirm } = renderDialog();
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(null));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("mineur connu : le dit, sans bouton pour confirmer", async () => {
    birth.mockReturnValue({ status: "minor", birthDate: "2015-01-01" });
    const { onConfirm } = renderDialog();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Ce monde est réservé aux personnes de 18 ans et plus.");
    expect(screen.queryByRole("button", { name: "Confirmer" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Jour" })).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("sans date connue : la demande, et la transmet à la confirmation", async () => {
    birth.mockReturnValue({ status: "unknown", birthDate: null });
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    await user.click(await screen.findByRole("combobox", { name: "Jour" }));
    await user.click(await screen.findByRole("option", { name: "15" }));
    await user.click(screen.getByRole("combobox", { name: "Mois" }));
    await user.click(await screen.findByRole("option", { name: "6" }));
    await user.click(screen.getByRole("combobox", { name: "Année" }));
    await user.click(await screen.findByRole("option", { name: "1990" }));
    expect(screen.getByText(/enregistrée dans votre compte/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));
    expect(onConfirm).toHaveBeenCalledWith("1990-06-15");
  });

  it("pendant la lecture : rien ne s'affiche ni ne se confirme", () => {
    birth.mockReturnValue({ status: "loading", birthDate: null });
    const { onConfirm } = renderDialog();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
