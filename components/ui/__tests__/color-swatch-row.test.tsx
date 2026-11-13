import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ColorSwatchRow } from "@/components/ui/color-swatch-row";
import { PLAYER_COLOR_PRESETS } from "@/components/ui/hsv-color-picker";

describe("ColorSwatchRow", () => {
  it("les douze pastilles de la palette « joueurs » ; un clic pose la couleur", async () => {
    const onChange = vi.fn();
    render(<ColorSwatchRow value="" onChange={onChange} chooseLabel="Choisir une couleur" />);
    const first = PLAYER_COLOR_PRESETS[0];
    await userEvent.click(screen.getByRole("button", { name: first.label }));
    expect(onChange).toHaveBeenCalledWith(first.value);
    // Pas de bascule « Aucune » sans `noneLabel`.
    expect(screen.queryByRole("button", { name: "Aucun" })).toBeNull();
  });

  it("la bascule « Aucun » pose une couleur vide, et s'affiche enfoncée quand il n'y en a pas", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ColorSwatchRow value="#818CF8" onChange={onChange} chooseLabel="Choisir" noneLabel="Aucun" />);
    const none = screen.getByRole("button", { name: "Aucun" });
    expect(none).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(none);
    expect(onChange).toHaveBeenCalledWith("");
    rerender(<ColorSwatchRow value="" onChange={onChange} chooseLabel="Choisir" noneLabel="Aucun" />);
    expect(screen.getByRole("button", { name: "Aucun" })).toHaveAttribute("aria-pressed", "true");
  });
});
