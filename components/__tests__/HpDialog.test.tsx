import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HpDialog } from "@/components/chatrooms/blocks/HpBlock";

describe("HpDialog (interactif)", () => {
  it("désactive Insérer tant que le formulaire est invalide, puis envoie un bloc JSON valide", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<HpDialog open onSend={onSend} />);

    const submit = screen.getByRole("button", { name: /insérer/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/Gornak/i), "Boss");
    await user.type(screen.getByPlaceholderText("62"), "40");
    await user.type(screen.getByPlaceholderText("100"), "100");

    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(onSend).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(onSend.mock.calls[0][0]);
    expect(payload).toEqual({ _type: "hp", name: "Boss", current: 40, max: 100 });
  });

  it("ne soumet pas si max vaut 0", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<HpDialog open onSend={onSend} />);

    await user.type(screen.getByPlaceholderText(/Gornak/i), "Boss");
    await user.type(screen.getByPlaceholderText("62"), "10");
    await user.type(screen.getByPlaceholderText("100"), "0");

    expect(screen.getByRole("button", { name: /insérer/i })).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });
});
