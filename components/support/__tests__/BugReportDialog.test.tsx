import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const envoyer = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/bugReports", () => ({ submitBugReport: envoyer }));

const toastErreur = vi.hoisted(() => vi.fn());
const toastSuccès = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastErreur, success: toastSuccès } }));

import { BugReportDialog } from "@/components/support/BugReportDialog";

function poser(onOpenChange = vi.fn()) {
  render(<BugReportDialog open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

const CHAMP = { name: "Que s’est-il passé ?" };

beforeEach(() => {
  vi.clearAllMocks();
  envoyer.mockResolvedValue({ ok: true });
});

describe("BugReportDialog", () => {
  it("n'envoie rien tant que rien n'est écrit", () => {
    poser();

    expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  });

  // La page et le navigateur font l'essentiel de la valeur d'un rapport : ce
  // sont les deux choses qu'un utilisateur ne pense jamais à donner.
  it("joint la page courante et le navigateur au signalement", async () => {
    const user = userEvent.setup();
    poser();

    await user.type(screen.getByRole("textbox", CHAMP), "Le bouton ne répond pas");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    await waitFor(() =>
      expect(envoyer).toHaveBeenCalledWith({
        description: "Le bouton ne répond pas",
        pageUrl: window.location.href,
        userAgent: window.navigator.userAgent,
      }),
    );
  });

  it("referme et remercie une fois le signalement parti", async () => {
    const user = userEvent.setup();
    const onOpenChange = poser();

    await user.type(screen.getByRole("textbox", CHAMP), "x");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastSuccès).toHaveBeenCalled();
  });

  // Un envoi qui échoue en silence laisserait croire au signalement d'être
  // parti — le plus sûr moyen de ne jamais recevoir le second.
  it("annonce un échec au lieu de refermer", async () => {
    envoyer.mockResolvedValue({ ok: false, error: "unauthenticated" });
    const user = userEvent.setup();
    const onOpenChange = poser();

    await user.type(screen.getByRole("textbox", CHAMP), "x");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    await waitFor(() => expect(toastErreur).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  // Ce qui part avec le rapport doit être dit avant l'envoi, pas découvert
  // après : la page et le navigateur sont des données personnelles.
  it("annonce ce qui est joint automatiquement", () => {
    poser();

    expect(screen.getByText(/joints automatiquement/)).toBeInTheDocument();
  });
});
