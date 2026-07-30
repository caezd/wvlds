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
  // Timeout relevé (défaut 5000ms) : 3 sélections Radix Select enchaînées
  // (vrais timers/animations, pas de mock) peuvent dépasser 5s sous la charge
  // CPU d'une suite complète en parallèle, même si chaque test est rapide en isolation.
  it("remonte adult=true pour une date de naissance majeure", async () => {
    const onAdultChange = vi.fn();
    const user = userEvent.setup();
    render(<AgeVerificationFields onAdultChange={onAdultChange} />);

    const year = String(new Date().getFullYear() - 30);
    await pickDate(user, "15", "6", year);

    await waitFor(() => expect(onAdultChange).toHaveBeenLastCalledWith(true));
  }, 10000);

  it("remonte adult=false et affiche l'erreur pour une date mineure", async () => {
    const onAdultChange = vi.fn();
    const user = userEvent.setup();
    render(<AgeVerificationFields onAdultChange={onAdultChange} />);

    const year = String(new Date().getFullYear() - 10);
    await pickDate(user, "15", "6", year);

    await waitFor(() => expect(onAdultChange).toHaveBeenLastCalledWith(false));
    expect(screen.getByText(/18 ans ou plus/i)).toBeVisible();
  }, 10000);

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
