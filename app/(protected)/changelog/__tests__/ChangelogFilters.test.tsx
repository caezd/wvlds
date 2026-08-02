import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangelogFilters } from "@/app/(protected)/changelog/ChangelogFilters";

describe("ChangelogFilters — filtre mobile (puces) et sidebar desktop", () => {
  it("affiche les entrées de toutes les catégories quand aucun filtre n'est actif", () => {
    render(<ChangelogFilters />);
    expect(screen.getByText(/bouton menu s'intègre/)).toBeInTheDocument();
    expect(screen.getByText(/restaient affichés tels quels/)).toBeInTheDocument();
  });

  it("ne garde que les entrées de la catégorie sélectionnée via une puce mobile", async () => {
    render(<ChangelogFilters />);

    await userEvent.click(screen.getByRole("button", { name: "Correctif" }));

    expect(screen.getByText(/restaient affichés tels quels/)).toBeInTheDocument();
    expect(screen.queryByText(/bouton menu s'intègre/)).not.toBeInTheDocument();
  });

  it("réinitialise le filtre via le bouton dédié", async () => {
    render(<ChangelogFilters />);

    await userEvent.click(screen.getByRole("button", { name: "Correctif" }));
    expect(screen.queryByText(/bouton menu s'intègre/)).not.toBeInTheDocument();

    // "Réinitialiser" existe deux fois dans le DOM (puces mobiles + sidebar
    // desktop) : seule la visibilité CSS (hidden lg:*) les distingue, invisible
    // pour jsdom — n'importe laquelle des deux doit réinitialiser le filtre.
    const [resetButton] = screen.getAllByRole("button", { name: "Réinitialiser" });
    await userEvent.click(resetButton);
    expect(screen.getByText(/bouton menu s'intègre/)).toBeInTheDocument();
  });

  it("la sidebar desktop propose une case à cocher par catégorie, synchronisée avec les puces", async () => {
    render(<ChangelogFilters />);

    const checkbox = screen.getByRole("checkbox", { name: "Correctif" });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Correctif" }));
    expect(checkbox).toBeChecked();
  });
});
