import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WikiTemplatePicker } from "@/components/worlds/wiki/WikiTemplatePicker";

describe("WikiTemplatePicker", () => {
  it("affiche « Vierge » quand aucun modèle n'est sélectionné", () => {
    render(<WikiTemplatePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Vierge")).toBeInTheDocument();
  });

  it("affiche le libellé du modèle sélectionné", () => {
    render(<WikiTemplatePicker value="character" onChange={vi.fn()} />);
    expect(screen.getByText("Fiche personnage")).toBeInTheDocument();
  });

  it("liste les 4 modèles plus l'option vierge dans le menu", async () => {
    const user = userEvent.setup();
    render(<WikiTemplatePicker value={null} onChange={vi.fn()} />);
    await user.click(screen.getByTitle("Modèle"));

    expect(screen.getByRole("menuitem", { name: "Vierge" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Fiche personnage/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /^Lieu$/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Faction \/ Organisation/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Événement historique/ })).toBeInTheDocument();
  });

  it("appelle onChange avec l'id du modèle choisi", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WikiTemplatePicker value={null} onChange={onChange} />);
    await user.click(screen.getByTitle("Modèle"));
    await user.click(screen.getByRole("menuitem", { name: /^Lieu$/ }));

    expect(onChange).toHaveBeenCalledWith("location");
  });

  it("appelle onChange avec null pour revenir à « Vierge »", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WikiTemplatePicker value="event" onChange={onChange} />);
    await user.click(screen.getByTitle("Modèle"));
    await user.click(screen.getByRole("menuitem", { name: "Vierge" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
