import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/client";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { UsernameRequiredDialog } from "@/components/UsernameRequiredDialog";
beforeEach(() => {
  vi.clearAllMocks();
});

describe("UsernameRequiredDialog", () => {
  it("affiche le pill « Ajouter un pseudo » puis révèle un champ de saisie au clic", async () => {
    const mock = createSupabaseMock({ results: [] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();

    render(<UsernameRequiredDialog userId="u1" />);

    expect(screen.getByText("Bonjour,")).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: /ajouter un pseudo/i });
    await user.click(addButton);

    expect(screen.getByPlaceholderText("pseudo")).toBeInTheDocument();
  });

  it("signale en direct un pseudo mal formé, sans interroger la base (migration 266)", async () => {
    const mock = createSupabaseMock({ results: [] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();

    render(<UsernameRequiredDialog userId="u1" />);

    await user.click(screen.getByRole("button", { name: /ajouter un pseudo/i }));
    await user.type(screen.getByPlaceholderText("pseudo"), "mon pseudo");

    expect(await screen.findByText("Pas d’espace dans le pseudo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continuer/i })).toBeDisabled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("signale en direct un pseudo déjà pris (migration 266)", async () => {
    const mock = createSupabaseMock({ results: [] });
    mock.rpc.mockResolvedValue({ data: false, error: null });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();

    render(<UsernameRequiredDialog userId="u1" />);

    await user.click(screen.getByRole("button", { name: /ajouter un pseudo/i }));
    await user.type(screen.getByPlaceholderText("pseudo"), "Brom");

    expect(await screen.findByText("Ce pseudo est déjà pris.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continuer/i })).toBeDisabled();
  });

  it("enregistre le pseudo et rafraîchit la page en cas de succès", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    mock.rpc.mockResolvedValue({ data: true, error: null });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();

    render(<UsernameRequiredDialog userId="u1" />);

    await user.click(screen.getByRole("button", { name: /ajouter un pseudo/i }));
    await user.type(screen.getByPlaceholderText("pseudo"), "mon_pseudo");
    await screen.findByText("Ce pseudo est disponible.");
    await user.click(screen.getByRole("button", { name: /continuer/i }));

    await waitFor(() => {
      expect(mock.buildersFor("profiles")[0].update).toHaveBeenCalledWith({
        username: "mon_pseudo",
      });
    });
    expect(mock.buildersFor("profiles")[0].eq).toHaveBeenCalledWith("id", "u1");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("affiche un message dédié si le pseudo est déjà pris", async () => {
    const mock = createSupabaseMock({
      results: [{ data: null, error: { message: "duplicate key value violates unique constraint" } }],
    });
    // Libre à la vérification, pris entre-temps : l'enregistrement le dit.
    mock.rpc.mockResolvedValue({ data: true, error: null });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();

    render(<UsernameRequiredDialog userId="u1" />);

    await user.click(screen.getByRole("button", { name: /ajouter un pseudo/i }));
    await user.type(screen.getByPlaceholderText("pseudo"), "mon_pseudo");
    await screen.findByText("Ce pseudo est disponible.");
    await user.click(screen.getByRole("button", { name: /continuer/i }));

    expect(await screen.findByText(/déjà pris/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
