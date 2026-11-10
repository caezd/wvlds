import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ColorPickerButton } from "@/components/worlds/settings/ColorPickerButton";

describe("ColorPickerButton", () => {
  it("ouvre le sélecteur, applique une pastille et se referme au clic extérieur", async () => {
    const onChange = vi.fn();
    render(
      <div>
        <ColorPickerButton color="#18181b" onChange={onChange} />
        <p>dehors</p>
      </div>,
    );

    expect(screen.queryByRole("group", { name: "Couleurs prédéfinies" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Choisir une couleur" }));

    expect(screen.getByRole("group", { name: "Couleurs prédéfinies" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Noir" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Bleu" }));
    expect(onChange).toHaveBeenCalledWith("#47b3f2");

    await userEvent.click(screen.getByText("dehors"));
    expect(screen.queryByRole("group", { name: "Couleurs prédéfinies" })).toBeNull();
  });

  it("montre le code de la couleur en cours", async () => {
    render(<ColorPickerButton color="#123456" onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Choisir une couleur" }));
    expect(screen.getByRole("textbox", { name: "Code hexadécimal" })).toHaveValue("#123456");
  });

  it("propose l'opacité, que la base accepte en #rrggbbaa", async () => {
    const onChange = vi.fn();
    render(<ColorPickerButton color="#ff0000" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Choisir une couleur" }));
    fireEvent.change(screen.getByRole("slider", { name: "Opacité" }), { target: { value: "50" } });
    expect(onChange).toHaveBeenLastCalledWith("#ff000080");
  });
});
