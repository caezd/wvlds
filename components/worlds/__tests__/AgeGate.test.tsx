import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const birth = vi.fn();
vi.mock("@/hooks/useMyBirthDate", () => ({ useMyBirthDate: () => birth() }));
const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));
const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

import { AgeGate } from "@/components/worlds/AgeGate";

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("AgeGate avec la date de naissance du compte (migration 266)", () => {
  it("majeur connu : entre sans rien demander", async () => {
    birth.mockReturnValue({ status: "adult", birthDate: "1990-06-15" });
    render(<AgeGate worldId="w1" worldName="Nuit" />);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("confirm_world_age", { p_world_id: "w1" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole("combobox", { name: "Jour" })).toBeNull();
  });

  it("mineur connu : le dit, sans saisie ni confirmation", () => {
    birth.mockReturnValue({ status: "minor", birthDate: "2015-01-01" });
    render(<AgeGate worldId="w1" worldName="Nuit" />);
    expect(screen.getByText("Ce monde est réservé aux personnes de 18 ans et plus.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmer" })).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sans date connue : la demande et l'envoie avec la confirmation", async () => {
    birth.mockReturnValue({ status: "unknown", birthDate: null });
    const user = userEvent.setup();
    render(<AgeGate worldId="w1" worldName="Nuit" />);
    await user.click(screen.getByRole("combobox", { name: "Jour" }));
    await user.click(await screen.findByRole("option", { name: "15" }));
    await user.click(screen.getByRole("combobox", { name: "Mois" }));
    await user.click(await screen.findByRole("option", { name: "6" }));
    await user.click(screen.getByRole("combobox", { name: "Année" }));
    await user.click(await screen.findByRole("option", { name: "1990" }));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("confirm_world_age", { p_world_id: "w1", p_birth_date: "1990-06-15" }),
    );
  });
});
