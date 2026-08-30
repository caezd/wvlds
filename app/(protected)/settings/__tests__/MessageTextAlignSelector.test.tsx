import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const updateMessageTextAlign = vi.fn();
vi.mock("../actions", () => ({
  updateMessageTextAlign: (...args: unknown[]) => updateMessageTextAlign(...args),
}));

import { toast } from "sonner";
import { MessageTextAlignSelector } from "../MessageTextAlignSelector";

describe("MessageTextAlignSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMessageTextAlign.mockResolvedValue({ success: true });
  });

  it("affiche les deux alignements avec la sélection actuelle mise en avant", () => {
    render(<MessageTextAlignSelector currentAlign="justify" />);

    expect(screen.getByText("textAlignOptions.left")).toBeInTheDocument();
    expect(screen.getByText("textAlignOptions.justify")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /textAlignOptions\.justify/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /textAlignOptions\.left/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("enregistre le nouvel alignement et rafraîchit la page au changement", async () => {
    render(<MessageTextAlignSelector currentAlign="left" />);

    fireEvent.click(screen.getByText("textAlignOptions.justify"));

    await waitFor(() => {
      expect(updateMessageTextAlign).toHaveBeenCalledWith("justify");
      expect(toast.success).toHaveBeenCalledWith("textAlignSaved");
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("n'appelle pas l'action si on reclique sur l'alignement déjà actif", () => {
    render(<MessageTextAlignSelector currentAlign="left" />);

    fireEvent.click(screen.getByText("textAlignOptions.left"));

    expect(updateMessageTextAlign).not.toHaveBeenCalled();
  });

  it("affiche une erreur si l'enregistrement échoue", async () => {
    updateMessageTextAlign.mockResolvedValue({ error: "unsupportedValue" });
    render(<MessageTextAlignSelector currentAlign="left" />);

    fireEvent.click(screen.getByText("textAlignOptions.justify"));

    await waitFor(() => {
      // L'action renvoie désormais un CODE, pas une phrase française : c'est
      // le client qui traduit. Un code inconnu — donc tout message brut de
      // PostgreSQL — retombe sur ce même message générique.
      expect(toast.error).toHaveBeenCalledWith("saveError");
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
