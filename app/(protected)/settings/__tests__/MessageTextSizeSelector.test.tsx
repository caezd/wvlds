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

const updateMessageTextSize = vi.fn();
vi.mock("../actions", () => ({
  updateMessageTextSize: (...args: unknown[]) => updateMessageTextSize(...args),
}));

import { toast } from "sonner";
import { MessageTextSizeSelector } from "../MessageTextSizeSelector";

describe("MessageTextSizeSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMessageTextSize.mockResolvedValue({ success: true });
  });

  it("affiche les trois tailles avec la sélection actuelle mise en avant", () => {
    render(<MessageTextSizeSelector currentSize="lg" />);

    expect(screen.getByText("textSizeOptions.sm")).toBeInTheDocument();
    expect(screen.getByText("textSizeOptions.base")).toBeInTheDocument();
    expect(screen.getByText("textSizeOptions.lg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /textSizeOptions\.lg/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("enregistre la nouvelle taille et rafraîchit la page au changement", async () => {
    render(<MessageTextSizeSelector currentSize="base" />);

    fireEvent.click(screen.getByText("textSizeOptions.sm"));

    await waitFor(() => {
      expect(updateMessageTextSize).toHaveBeenCalledWith("sm");
      expect(toast.success).toHaveBeenCalledWith("textSizeSaved");
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("n'appelle pas l'action si on reclique sur la taille déjà active", () => {
    render(<MessageTextSizeSelector currentSize="base" />);

    fireEvent.click(screen.getByText("textSizeOptions.base"));

    expect(updateMessageTextSize).not.toHaveBeenCalled();
  });

  it("affiche une erreur si l'enregistrement échoue", async () => {
    updateMessageTextSize.mockResolvedValue({ error: "unsupportedValue" });
    render(<MessageTextSizeSelector currentSize="base" />);

    fireEvent.click(screen.getByText("textSizeOptions.lg"));

    await waitFor(() => {
      // L'action renvoie désormais un CODE, pas une phrase française : c'est
      // le client qui traduit. Un code inconnu — donc tout message brut de
      // PostgreSQL — retombe sur ce même message générique.
      expect(toast.error).toHaveBeenCalledWith("saveError");
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
