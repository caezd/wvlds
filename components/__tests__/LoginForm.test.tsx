import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signInWithPassword } }) }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { LoginForm } from "@/components/login-form";

beforeEach(() => {
  vi.clearAllMocks();
  signInWithPassword.mockResolvedValue({ error: null });
});

async function seConnecter() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Courriel"), "a@b.test");
  await user.type(screen.getByLabelText("Mot de passe"), "motdepasse1");
  await user.click(screen.getByRole("button", { name: "Connexion" }));
}

describe("LoginForm : retour au lien partagé après la connexion", () => {
  it("sans lien : l'accueil", async () => {
    render(<LoginForm />);
    await seConnecter();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("avec un lien de monde : le monde", async () => {
    render(<LoginForm next="/w/f1e4d2c9-e56f-454a-bde2-8f9eade06e65" worldName="Hextech" />);
    expect(screen.getByText("Hextech")).toBeInTheDocument();
    await seConnecter();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/w/f1e4d2c9-e56f-454a-bde2-8f9eade06e65"));
  });

  it("un retour hors du site est ignoré", async () => {
    render(<LoginForm next="//evil.test" />);
    await seConnecter();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });
});
