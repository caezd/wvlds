import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { SignedAmountInput } from "@/components/economy/SignedAmountInput";

const UNITS = [
  { name: "Or", short: "po", value: 100 },
  { name: "Argent", short: "pa", value: 1 },
];

function Monter({ initial, onChange }: { initial: number | null; onChange: (v: number | null) => void }) {
  const [value, setValue] = React.useState(initial);
  return (
    <SignedAmountInput
      units={UNITS}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      idPrefix="g"
      labelOf={(u) => `Montant en ${u.name}`}
      signLabel="Retirer au lieu de donner"
    />
  );
}

const sens = () => screen.getByRole("switch", { name: "Retirer au lieu de donner" });

describe("SignedAmountInput", () => {
  it("un montant négatif s'affiche en valeur absolue, précédé de « − »", () => {
    render(<Monter initial={-150} onChange={vi.fn()} />);
    expect(sens()).toBeChecked();
    expect(sens()).toHaveTextContent("−");
    expect(screen.getByRole("spinbutton", { name: "Montant en Or" })).toHaveValue(1);
    expect(screen.getByRole("spinbutton", { name: "Montant en Argent" })).toHaveValue(50);
  });

  it("un clic inverse le montant, aussitôt transmis ; la saisie garde le sens", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Monter initial={5} onChange={onChange} />);
    expect(sens()).not.toBeChecked();
    expect(sens()).toHaveTextContent("+");
    await user.click(sens());
    expect(onChange).toHaveBeenLastCalledWith(-5);
    expect(sens()).toHaveTextContent("−");
    await user.type(screen.getByRole("spinbutton", { name: "Montant en Or" }), "1");
    expect(onChange).toHaveBeenLastCalledWith(-105);
    await user.click(sens());
    expect(onChange).toHaveBeenLastCalledWith(105);
  });

  it("sans montant, pas de sens à choisir : rien qui ne s'enregistrerait", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Monter initial={null} onChange={onChange} />);
    expect(sens()).toBeDisabled();
    await user.type(screen.getByRole("spinbutton", { name: "Montant en Argent" }), "3");
    expect(sens()).toBeEnabled();
    expect(onChange).toHaveBeenLastCalledWith(3);
  });
});
