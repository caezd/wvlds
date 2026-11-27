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

const updateMessageHeaderMode = vi.fn();
vi.mock("../actions", () => ({
  updateMessageHeaderMode: (...args: unknown[]) => updateMessageHeaderMode(...args),
}));

import { toast } from "sonner";
import { MessageHeaderModeSelector } from "../MessageHeaderModeSelector";

describe("MessageHeaderModeSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMessageHeaderMode.mockResolvedValue({ success: true });
  });

  it("affiche les deux en-têtes avec la sélection actuelle mise en avant", () => {
    render(<MessageHeaderModeSelector currentMode="hidden" />);

    expect(screen.getByText("headerModeOptions.subtle")).toBeInTheDocument();
    expect(screen.getByText("headerModeOptions.hidden")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /headerModeOptions\.hidden/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /headerModeOptions\.subtle/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("enregistre le nouvel en-tête et rafraîchit la page au changement", async () => {
    render(<MessageHeaderModeSelector currentMode="subtle" />);

    fireEvent.click(screen.getByText("headerModeOptions.hidden"));

    await waitFor(() => {
      expect(updateMessageHeaderMode).toHaveBeenCalledWith("hidden");
      expect(toast.success).toHaveBeenCalledWith("headerModeSaved");
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("n'appelle pas l'action si on reclique sur l'en-tête déjà actif", () => {
    render(<MessageHeaderModeSelector currentMode="subtle" />);

    fireEvent.click(screen.getByText("headerModeOptions.subtle"));

    expect(updateMessageHeaderMode).not.toHaveBeenCalled();
  });

  it("affiche une erreur si l'enregistrement échoue", async () => {
    updateMessageHeaderMode.mockResolvedValue({ error: "unsupportedValue" });
    render(<MessageHeaderModeSelector currentMode="subtle" />);

    fireEvent.click(screen.getByText("headerModeOptions.hidden"));

    await waitFor(() => {
      // L'action renvoie désormais un CODE, pas une phrase française : c'est
      // le client qui traduit. Un code inconnu — donc tout message brut de
      // PostgreSQL — retombe sur ce même message générique.
      expect(toast.error).toHaveBeenCalledWith("saveError");
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
