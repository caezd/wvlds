import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangelogFilters } from "@/app/(protected)/changelog/ChangelogFilters";
import { CHANGELOG } from "@/lib/changelog";

/**
 * Deux entrées prises dans le changelog lui-même, de catégories différentes.
 *
 * Les tests cherchaient deux textes précis d'entrées anciennes : la première
 * retouche éditoriale du changelog les a cassés sans qu'aucun filtre n'ait
 * changé. Ils partent maintenant de ce qui existe, quoi qu'on y écrive.
 */
const correctif = CHANGELOG.find(e => e.tag === "Correctif")!;
const autre = CHANGELOG.find(e => e.tag !== "Correctif")!;
/** Une phrase de l'entrée, assez pour la reconnaître, assez courte pour tenir sur un nœud. */
const extrait = (texte: string) => texte.split(/[.;:—]/)[0].trim().slice(0, 40);
const TEXTE_CORRECTIF = extrait(correctif.text);
const TEXTE_AUTRE = extrait(autre.text);

describe("ChangelogFilters — filtre mobile (puces) et sidebar desktop", () => {
  it("affiche les entrées de toutes les catégories quand aucun filtre n'est actif", () => {
    render(<ChangelogFilters />);
    expect(screen.getByText(TEXTE_AUTRE, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(TEXTE_CORRECTIF, { exact: false })).toBeInTheDocument();
  });

  it("ne garde que les entrées de la catégorie sélectionnée via une puce mobile", async () => {
    render(<ChangelogFilters />);

    await userEvent.click(screen.getByRole("button", { name: "Correctif" }));

    expect(screen.getByText(TEXTE_CORRECTIF, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(TEXTE_AUTRE, { exact: false })).not.toBeInTheDocument();
  });

  it("réinitialise le filtre via le bouton dédié", async () => {
    render(<ChangelogFilters />);

    await userEvent.click(screen.getByRole("button", { name: "Correctif" }));
    expect(screen.queryByText(TEXTE_AUTRE, { exact: false })).not.toBeInTheDocument();

    // "Réinitialiser" existe deux fois dans le DOM (puces mobiles + sidebar
    // desktop) : seule la visibilité CSS (hidden lg:*) les distingue, invisible
    // pour jsdom — n'importe laquelle des deux doit réinitialiser le filtre.
    const [resetButton] = screen.getAllByRole("button", { name: "Réinitialiser" });
    await userEvent.click(resetButton);
    expect(screen.getByText(TEXTE_AUTRE, { exact: false })).toBeInTheDocument();
  });

  it("la sidebar desktop propose une case à cocher par catégorie, synchronisée avec les puces", async () => {
    render(<ChangelogFilters />);

    const checkbox = screen.getByRole("checkbox", { name: "Correctif" });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Correctif" }));
    expect(checkbox).toBeChecked();
  });
});
