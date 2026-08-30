import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AgeVerificationFields } from "@/components/worlds/AgeVerificationFields";

async function pickDate(user: ReturnType<typeof userEvent.setup>, day: string, month: string, year: string) {
  // Radix Select : ouvrir le trigger (role combobox) puis cliquer l'option.
  await user.click(screen.getByRole("combobox", { name: /jour/i }));
  await user.click(await screen.findByRole("option", { name: day }));
  await user.click(screen.getByRole("combobox", { name: /mois/i }));
  await user.click(await screen.findByRole("option", { name: month }));
  await user.click(screen.getByRole("combobox", { name: /année/i }));
  await user.click(await screen.findByRole("option", { name: year }));
}

beforeEach(() => vi.clearAllMocks());

describe("AgeVerificationFields", () => {
  // Ces deux tests enchaînent 3 sélections Radix Select avec de vrais
  // timers : ~800 ms en isolation, mais jusqu'à dix fois plus sous la
  // contention CPU de la suite complète. Ils portaient un timeout local de
  // 10 s qui écrasait — en le réduisant — le global de 15 s posé dans
  // vitest.config.ts ; ils échouaient donc encore par intermittence. Le
  // réglage global suffit, on le laisse faire.
  it("remonte adult=true pour une date de naissance majeure", async () => {
    const onAdultChange = vi.fn();
    const user = userEvent.setup();
    render(<AgeVerificationFields onAdultChange={onAdultChange} />);

    const year = String(new Date().getFullYear() - 30);
    await pickDate(user, "15", "6", year);

    await waitFor(() => expect(onAdultChange).toHaveBeenLastCalledWith(true));
  });

  it("remonte adult=false et affiche l'erreur pour une date mineure", async () => {
    const onAdultChange = vi.fn();
    const user = userEvent.setup();
    render(<AgeVerificationFields onAdultChange={onAdultChange} />);

    const year = String(new Date().getFullYear() - 10);
    await pickDate(user, "15", "6", year);

    await waitFor(() => expect(onAdultChange).toHaveBeenLastCalledWith(false));
    expect(screen.getByText(/18 ans ou plus/i)).toBeVisible();
  });

  it("ne signale pas majeur tant que les trois champs ne sont pas remplis", async () => {
    const onAdultChange = vi.fn();
    const user = userEvent.setup();
    render(<AgeVerificationFields onAdultChange={onAdultChange} />);

    await user.click(screen.getByRole("combobox", { name: /jour/i }));
    await user.click(await screen.findByRole("option", { name: "15" }));

    // Un seul champ rempli → jamais true.
    expect(onAdultChange).not.toHaveBeenCalledWith(true);
  });
});
