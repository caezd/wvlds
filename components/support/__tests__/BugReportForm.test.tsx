import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const envoyer = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/bugReports", () => ({ submitBugReport: envoyer }));

const toastErreur = vi.hoisted(() => vi.fn());
const toastSuccès = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastErreur, success: toastSuccès } }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// La conversion est éprouvée ailleurs ; ici elle brouillerait la lecture.
vi.mock("@/lib/imageUtils", () => ({ toWebP: vi.fn(async (f: File) => f) }));

const déposer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    storage: { from: () => ({ upload: déposer }) },
  }),
}));

import { BugReportForm } from "@/components/support/BugReportForm";

const CHAMP = { name: "Que s’est-il passé ?" };

beforeEach(() => {
  vi.clearAllMocks();
  envoyer.mockResolvedValue({ ok: true });
  déposer.mockResolvedValue({ error: null });
});

function image(nom = "capture.png") {
  return new File(["x"], nom, { type: "image/png" });
}

describe("BugReportForm", () => {
  it("n'envoie rien tant que rien n'est écrit", () => {
    render(<BugReportForm />);

    expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  });

  it("joint la page courante et le navigateur", async () => {
    const user = userEvent.setup();
    render(<BugReportForm />);

    await user.type(screen.getByRole("textbox", CHAMP), "Le bouton ne répond pas");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    await waitFor(() =>
      expect(envoyer).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Le bouton ne répond pas",
          pageUrl: window.location.href,
          userAgent: window.navigator.userAgent,
          attachments: [],
        }),
      ),
    );
  });

  // Les images partent vers le stockage AVANT le rapport, et seuls leurs
  // chemins l'accompagnent : c'est ce qui permet au bucket d'être privé sans
  // que le serveur ait à relayer les octets.
  it("dépose les images sous le préfixe de leur auteur, puis n'envoie que les chemins", async () => {
    const user = userEvent.setup();
    render(<BugReportForm />);

    await user.upload(screen.getByLabelText("Captures d’écran", { selector: "input" }), image());
    await user.type(screen.getByRole("textbox", CHAMP), "x");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    await waitFor(() => expect(déposer).toHaveBeenCalledTimes(1));
    expect(déposer.mock.calls[0][0]).toMatch(/^user-u1\//);

    const envoyé = envoyer.mock.calls[0][0];
    expect(envoyé.attachments).toHaveLength(1);
    expect(envoyé.attachments[0]).toMatch(/^user-u1\//);
  });

  // Un dépôt qui échoue ne doit pas laisser partir un rapport qui référencerait
  // une image inexistante.
  it("n'envoie pas le rapport si une image n'a pas pu être déposée", async () => {
    déposer.mockResolvedValue({ error: { message: "stockage plein" } });
    const user = userEvent.setup();
    render(<BugReportForm />);

    await user.upload(screen.getByLabelText("Captures d’écran", { selector: "input" }), image());
    await user.type(screen.getByRole("textbox", CHAMP), "x");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    await waitFor(() => expect(toastErreur).toHaveBeenCalled());
    expect(envoyer).not.toHaveBeenCalled();
  });

  // Ce qui part avec le rapport doit être dit avant l'envoi, pas découvert
  // après : la page et le navigateur sont des données personnelles.
  it("annonce ce qui est joint automatiquement", () => {
    render(<BugReportForm />);

    expect(screen.getByText(/joints automatiquement/)).toBeInTheDocument();
  });
});
