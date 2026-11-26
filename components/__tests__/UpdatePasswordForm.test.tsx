import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/client";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { UpdatePasswordForm } from "@/components/update-password-form";

function setup(profile: { username: string | null }) {
  const mock = createSupabaseMock({
    user: { id: "u1" },
    results: [{ data: profile }, { data: null, error: null }],
  });
  const updateUser = vi.fn().mockResolvedValue({ error: null });
  Object.assign(mock.client.auth, { updateUser });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return { mock, updateUser };
}

beforeEach(() => vi.clearAllMocks());

describe("UpdatePasswordForm : finaliser un compte invité (migration 266)", () => {
  it("compte sans pseudo : pseudo vérifié en direct, date de naissance enregistrée", async () => {
    const { mock, updateUser } = setup({ username: null });
    mock.rpc.mockImplementation(async (fn: string) =>
      fn === "is_username_available" ? { data: true, error: null } : { data: null, error: null },
    );
    const user = userEvent.setup();
    render(<UpdatePasswordForm />);

    await user.type(await screen.findByLabelText("Pseudo"), "Lia_92");
    expect(await screen.findByText("Ce pseudo est disponible.")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Jour" }));
    await user.click(await screen.findByRole("option", { name: "15" }));
    await user.click(screen.getByRole("combobox", { name: "Mois" }));
    await user.click(await screen.findByRole("option", { name: "6" }));
    await user.click(screen.getByRole("combobox", { name: "Année" }));
    await user.click(await screen.findByRole("option", { name: "1990" }));

    await user.type(screen.getByLabelText("Mot de passe"), "motdepasse1");
    await user.type(screen.getByLabelText("Confirmer le mot de passe"), "motdepasse1");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: "motdepasse1" }));
    expect(mock.buildersFor("profiles")[1].update).toHaveBeenCalledWith({ username: "Lia_92" });
    expect(mock.rpc).toHaveBeenCalledWith("set_my_birth_date", { p_birth_date: "1990-06-15" });
    expect(push).toHaveBeenCalledWith("/");
  });

  it("un espace dans le pseudo est signalé en direct", async () => {
    setup({ username: null });
    const user = userEvent.setup();
    render(<UpdatePasswordForm />);
    await user.type(await screen.findByLabelText("Pseudo"), "mon pseudo");
    expect(await screen.findByText("Pas d’espace dans le pseudo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("simple réinitialisation : ni pseudo ni date de naissance", async () => {
    const { mock } = setup({ username: "Lia" });
    render(<UpdatePasswordForm />);
    await waitFor(() => expect(mock.from).toHaveBeenCalledWith("profiles"));
    expect(screen.queryByLabelText("Pseudo")).toBeNull();
    expect(screen.queryByRole("group", { name: "Date de naissance" })).toBeNull();
  });
});
