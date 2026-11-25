import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { digitsOnly } from "@/lib/digitsOnly";
import { AmountInput } from "@/components/economy/AmountInput";

describe("digitsOnly", () => {
  it("une case numérique n'accepte que des chiffres : ni e, ni signe, ni séparateur", async () => {
    const user = userEvent.setup();
    render(<input type="number" aria-label="n" {...digitsOnly} />);
    await user.type(screen.getByRole("spinbutton"), "1e-2.5,+3");
    expect(screen.getByRole("spinbutton")).toHaveValue(1253);
  });

  it("les raccourcis et touches d'édition passent", async () => {
    const user = userEvent.setup();
    render(<input type="number" aria-label="n" {...digitsOnly} />);
    await user.type(screen.getByRole("spinbutton"), "12{Backspace}4{ArrowLeft}");
    expect(screen.getByRole("spinbutton")).toHaveValue(14);
  });

  it("un collage sans chiffre seul est refusé", () => {
    const prevent = vi.fn();
    digitsOnly.onPaste({ clipboardData: { getData: () => "1e5" }, preventDefault: prevent } as never);
    expect(prevent).toHaveBeenCalled();
    prevent.mockClear();
    digitsOnly.onPaste({ clipboardData: { getData: () => "150" }, preventDefault: prevent } as never);
    expect(prevent).not.toHaveBeenCalled();
  });

  it("les cases d'un montant (gains, taxe…) en profitent", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AmountInput compact units={[{ name: "Or", short: "po", value: 1 }]} value={null} onChange={onChange} idPrefix="a" labelOf={() => "Or"} />,
    );
    await user.type(screen.getByRole("spinbutton", { name: "Or" }), "-5e");
    expect(onChange).toHaveBeenLastCalledWith(5);
  });
});
