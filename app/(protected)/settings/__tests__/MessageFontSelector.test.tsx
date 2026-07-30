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

const updateMessageFont = vi.fn();
vi.mock("../actions", () => ({
  updateMessageFont: (...args: unknown[]) => updateMessageFont(...args),
}));

import { toast } from "sonner";
import { MessageFontSelector } from "../MessageFontSelector";

describe("MessageFontSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMessageFont.mockResolvedValue({ success: true });
  });

  it("affiche les trois cartes de prévisualisation avec la sélection actuelle mise en avant", () => {
    render(<MessageFontSelector currentFont="serif" />);

    expect(screen.getByText("fontOptions.sans")).toBeInTheDocument();
    expect(screen.getByText("fontOptions.serif")).toBeInTheDocument();
    expect(screen.getByText("fontOptions.dyslexic")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fontOptions\.serif/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /fontOptions\.sans/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /fontOptions\.dyslexic/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("enregistre la police dyslexie au clic", async () => {
    render(<MessageFontSelector currentFont="sans" />);

    fireEvent.click(screen.getByText("fontOptions.dyslexic"));

    await waitFor(() => {
      expect(updateMessageFont).toHaveBeenCalledWith("dyslexic");
    });
  });

  it("enregistre la nouvelle police et rafraîchit la page au changement", async () => {
    render(<MessageFontSelector currentFont="sans" />);

    fireEvent.click(screen.getByText("fontOptions.serif"));

    await waitFor(() => {
      expect(updateMessageFont).toHaveBeenCalledWith("serif");
      expect(toast.success).toHaveBeenCalledWith("fontSaved");
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("n'appelle pas l'action si on reclique sur la police déjà active", () => {
    render(<MessageFontSelector currentFont="sans" />);

    fireEvent.click(screen.getByText("fontOptions.sans"));

    expect(updateMessageFont).not.toHaveBeenCalled();
  });

  it("affiche une erreur si l'enregistrement échoue", async () => {
    updateMessageFont.mockResolvedValue({ error: "Police non supportée" });
    render(<MessageFontSelector currentFont="sans" />);

    fireEvent.click(screen.getByText("fontOptions.serif"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Police non supportée");
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
