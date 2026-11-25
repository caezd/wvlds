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
      signLabel="Sens"
      plusLabel="Donne"
      minusLabel="Retire"
    />
  );
}

const sens = (name: string) => screen.getByRole("radio", { name });

describe("SignedAmountInput", () => {
  it("un montant négatif s'affiche en valeur absolue, « Retire » coché", () => {
    render(<Monter initial={-150} onChange={vi.fn()} />);
    expect(sens("Retire")).toBeChecked();
    expect(sens("Donne")).not.toBeChecked();
    expect(screen.getByRole("spinbutton", { name: "Montant en Or" })).toHaveValue(1);
    expect(screen.getByRole("spinbutton", { name: "Montant en Argent" })).toHaveValue(50);
  });

  it("changer de sens inverse le montant ; la saisie garde le sens choisi", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Monter initial={5} onChange={onChange} />);
    expect(sens("Donne")).toBeChecked();
    await user.click(sens("Retire"));
    expect(onChange).toHaveBeenLastCalledWith(-5);
    await user.type(screen.getByRole("spinbutton", { name: "Montant en Or" }), "1");
    expect(onChange).toHaveBeenLastCalledWith(-105);
    await user.click(sens("Donne"));
    expect(onChange).toHaveBeenLastCalledWith(105);
  });

  it("le sens choisi sur un montant vide ou nul vaut pour la saisie qui suit", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Monter initial={null} onChange={onChange} />);
    await user.click(sens("Retire"));
    expect(onChange).not.toHaveBeenCalled();
    expect(sens("Retire")).toBeChecked();
    await user.type(screen.getByRole("spinbutton", { name: "Montant en Argent" }), "3");
    expect(onChange).toHaveBeenLastCalledWith(-3);
  });
});
