import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HelpHint } from "@/components/ui/help-hint";

describe("HelpHint", () => {
  it("un bouton « Aide : … », dont l'explication est la description, sans ouvrir la carte", () => {
    render(<HelpHint title="Saisons">Des âges nommés qui découpent l'histoire du monde.</HelpHint>);
    const bouton = screen.getByRole("button", { name: "Aide : Saisons" });
    expect(bouton).toHaveAccessibleDescription("Des âges nommés qui découpent l'histoire du monde.");
    expect(bouton).toHaveAttribute("aria-expanded", "false");
    // La carte n'est pas ouverte : l'explication n'est que la description.
    expect(screen.getAllByText("Des âges nommés qui découpent l'histoire du monde.")).toHaveLength(1);
  });

  it("sans titre, simplement « Aide »", () => {
    render(<HelpHint>Explication.</HelpHint>);
    expect(screen.getByRole("button", { name: "Aide" })).toBeInTheDocument();
  });

  it("au toucher, un appui ouvre la carte (pas de survol sur mobile), un second la referme", async () => {
    render(<HelpHint title="Saisons">Explication.</HelpHint>);
    const bouton = screen.getByRole("button", { name: "Aide : Saisons" });
    fireEvent.pointerDown(bouton, { pointerType: "touch" });
    expect(bouton).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findAllByText("Explication.")).toHaveLength(2);
    fireEvent.pointerDown(bouton, { pointerType: "touch" });
    expect(bouton).toHaveAttribute("aria-expanded", "false");
  });

  it("au clavier, le focus l'ouvre ; Entrée la bascule", async () => {
    const user = userEvent.setup();
    render(<HelpHint title="Saisons">Explication.</HelpHint>);
    const bouton = screen.getByRole("button", { name: "Aide : Saisons" });
    await user.tab();
    expect(bouton).toHaveFocus();
    await vi.waitFor(() => expect(bouton).toHaveAttribute("aria-expanded", "true"));
    await user.keyboard("{Enter}");
    expect(bouton).toHaveAttribute("aria-expanded", "false");
  });

  it("dans un libellé, un appui n'active pas le champ voisin", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <label>
        Journaux <HelpHint title="Journaux">Explication.</HelpHint>
        <input type="checkbox" onChange={onChange} />
      </label>,
    );
    await user.click(screen.getByRole("button", { name: "Aide : Journaux" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
});
