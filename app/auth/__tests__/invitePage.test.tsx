import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const exchangeCodeForSession = vi.fn();
const setSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { exchangeCodeForSession, setSession } }),
}));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import InvitePage from "@/app/auth/invite/page";

function visiter(url: string) {
  window.history.replaceState(null, "", url);
}

beforeEach(() => vi.clearAllMocks());

describe("lien d'invitation", () => {
  it("pendant la vérification, le dit", () => {
    exchangeCodeForSession.mockReturnValue(new Promise(() => {}));
    visiter("/auth/invite?code=abc");
    render(<InvitePage />);
    expect(screen.getByRole("heading", { name: "Vérification en cours…" })).toBeInTheDocument();
    expect(screen.getByText("Veuillez patienter pendant que nous établissons votre session.")).toBeInTheDocument();
  });

  it("un lien sans jeton : invalide, avec le retour à la connexion", async () => {
    visiter("/auth/invite");
    render(<InvitePage />);
    expect(await screen.findByRole("heading", { name: "Lien invalide" })).toBeInTheDocument();
    expect(screen.getByText("Ce lien est invalide ou a expiré.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour à la connexion" })).toHaveAttribute("href", "/auth/login");
  });

  it("une erreur de Supabase n'est pas affichée telle quelle", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid flow state, no valid flow state found" } });
    visiter("/auth/invite?code=abc");
    render(<InvitePage />);
    expect(await screen.findByText("Ce lien est invalide ou a expiré.")).toBeInTheDocument();
    expect(screen.queryByText(/flow state/)).toBeNull();
  });

  it("une erreur renvoyée dans le lien n'est pas affichée telle quelle", async () => {
    visiter("/auth/invite#error_description=Email+link+is+invalid+or+has+expired");
    render(<InvitePage />);
    expect(await screen.findByText("Ce lien est invalide ou a expiré.")).toBeInTheDocument();
    expect(screen.queryByText(/Email link/)).toBeNull();
  });
});
