import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NumberInput } from "@/components/ui/number-input";

function Controlled({ initial = null, min, max, disabled }: { initial?: number | null; min?: number; max?: number; disabled?: boolean }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <NumberInput aria-label="Quantité" value={value} onValueChange={setValue} min={min} max={max} disabled={disabled} />
      <output>{value === null ? "vide" : value}</output>
    </>
  );
}

const champ = () => screen.getByRole("spinbutton", { name: "Quantité" });
const plus = () => screen.getByRole("button", { name: "Augmenter : Quantité" });
const moins = () => screen.getByRole("button", { name: "Diminuer : Quantité" });
const valeur = () => screen.getByRole("status").textContent;

describe("NumberInput", () => {
  it("un champ numérique et ses boutons −/+", async () => {
    const user = userEvent.setup();
    render(<Controlled initial={2} />);
    expect(champ()).toHaveValue(2);
    await user.click(plus());
    expect(valeur()).toBe("3");
    await user.click(moins());
    await user.click(moins());
    expect(valeur()).toBe("1");
  });

  it("les boutons restent dans les bornes ; vide, + compte comme depuis le minimum", async () => {
    const user = userEvent.setup();
    render(<Controlled min={0} max={2} />);
    await user.click(plus());
    expect(valeur()).toBe("1");
    await user.click(plus());
    expect(valeur()).toBe("2");
    expect(plus()).toBeDisabled();
  });

  it("vide, − donne le minimum", async () => {
    const user = userEvent.setup();
    render(<Controlled min={0} />);
    await user.click(moins());
    expect(valeur()).toBe("0");
  });

  it("au minimum, − est inactif", () => {
    render(<Controlled initial={0} min={0} />);
    expect(moins()).toBeDisabled();
  });

  it("la saisie au clavier ; vider le champ rend null", async () => {
    const user = userEvent.setup();
    render(<Controlled initial={4} />);
    await user.clear(champ());
    expect(valeur()).toBe("vide");
    await user.type(champ(), "12");
    expect(valeur()).toBe("12");
  });

  it("désactivé : champ et boutons", () => {
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantité" value={1} onValueChange={onValueChange} disabled />);
    expect(champ()).toBeDisabled();
    expect(plus()).toBeDisabled();
    expect(moins()).toBeDisabled();
  });
});
