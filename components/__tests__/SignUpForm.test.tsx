import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const rpc = vi.fn();
const signUp = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc, auth: { signUp } }) }));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { SignUpForm } from "@/components/sign-up-form";

type User = ReturnType<typeof userEvent.setup>;

async function pickBirthDate(user: User, day: string, month: string, year: string) {
  await user.click(screen.getByRole("combobox", { name: "Jour" }));
  await user.click(await screen.findByRole("option", { name: day }));
  await user.click(screen.getByRole("combobox", { name: "Mois" }));
  await user.click(await screen.findByRole("option", { name: month }));
  await user.click(screen.getByRole("combobox", { name: "Année" }));
  await user.click(await screen.findByRole("option", { name: year }));
}

async function fillAll(user: User, { username = "Lia_92", year = "1990" } = {}) {
  await user.type(screen.getByLabelText("Pseudo"), username);
  await user.type(screen.getByLabelText("Courriel"), "lia@example.com");
  await pickBirthDate(user, "15", "6", year);
  await user.type(screen.getByLabelText("Mot de passe"), "motdepasse1");
  await user.type(screen.getByLabelText("Confirmer le mot de passe"), "motdepasse1");
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: true, error: null });
  signUp.mockResolvedValue({ error: null });
});

describe("SignUpForm : pseudo et date de naissance (migration 266)", () => {
  it("demande le pseudo et la date de naissance avec l'email et le mot de passe", () => {
    render(<SignUpForm />);
    expect(screen.getByRole("heading", { name: "Inscription" })).toBeInTheDocument();
    expect(screen.getByLabelText("Pseudo")).toBeInTheDocument();
    expect(screen.getByLabelText("Courriel")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Date de naissance" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe")).toBeInTheDocument();
  });

  it("le pseudo porte une aide : ses règles, en pastille et non sous le champ", () => {
    render(<SignUpForm />);
    const aide = screen.getByRole("button", { name: "Aide : Pseudo" });
    expect(aide).toHaveAccessibleDescription(
      "Visible par les autres membres. Lettres sans accent, chiffres et tiret bas (_), de 3 à 32 caractères.",
    );
    // Une seule fois : la description (lecteurs d'écran), pas une ligne sous le champ.
    expect(screen.getAllByText(/^Visible par les autres membres/)).toHaveLength(1);
  });

  it("la date de naissance porte une aide : elle reste privée", () => {
    render(<SignUpForm />);
    const aide = screen.getByRole("button", { name: "Aide : Date de naissance" });
    expect(aide).toHaveAccessibleDescription("Votre date de naissance reste privée.");
  });

  it("un espace dans le pseudo est signalé en direct, sans interroger la base", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Pseudo"), "mon pseudo");
    expect(await screen.findByText("Pas d’espace dans le pseudo.")).toBeInTheDocument();
    expect(screen.getByLabelText("Pseudo")).toHaveAttribute("aria-invalid", "true");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("un pseudo déjà pris est signalé en direct", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const user = userEvent.setup();
    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Pseudo"), "Brom");
    expect(await screen.findByText("Ce pseudo est déjà pris.")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("is_username_available", { p_username: "Brom" });
  });

  it("un pseudo libre est dit disponible", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Pseudo"), "Lia_92");
    expect(await screen.findByText("Ce pseudo est disponible.")).toBeInTheDocument();
  });

  it("l'inscription envoie le pseudo et la date de naissance avec le compte", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await fillAll(user);
    await screen.findByText("Ce pseudo est disponible.");
    await user.click(screen.getByRole("button", { name: "S’inscrire" }));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp.mock.calls[0][0]).toMatchObject({
      email: "lia@example.com",
      password: "motdepasse1",
      options: { data: { username: "Lia_92", birth_date: "1990-06-15" } },
    });
    expect(push).toHaveBeenCalledWith("/auth/sign-up-success");
  });

  it("tant que le pseudo est pris, l'inscription ne part pas", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const user = userEvent.setup();
    render(<SignUpForm />);
    await fillAll(user, { username: "Brom" });
    await screen.findByText("Ce pseudo est déjà pris.");
    expect(screen.getByRole("button", { name: "S’inscrire" })).toBeDisabled();
  });

  it("sans date de naissance, l'inscription ne part pas", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Pseudo"), "Lia_92");
    await user.type(screen.getByLabelText("Courriel"), "lia@example.com");
    await user.type(screen.getByLabelText("Mot de passe"), "motdepasse1");
    await user.type(screen.getByLabelText("Confirmer le mot de passe"), "motdepasse1");
    await screen.findByText("Ce pseudo est disponible.");
    expect(screen.getByRole("button", { name: "S’inscrire" })).toBeDisabled();
  });

  it("une date qui n'existe pas est signalée", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await pickBirthDate(user, "31", "2", "1990");
    expect(await screen.findByText("Cette date n’existe pas.")).toBeInTheDocument();
  });
});
