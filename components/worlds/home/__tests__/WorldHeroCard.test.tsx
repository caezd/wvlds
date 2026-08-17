import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { WorldHeroCard } from "@/components/worlds/home/WorldHeroCard";

describe("WorldHeroCard", () => {
  it("n'affiche plus de titre ni de description superposés (déplacés dans WorldHome)", () => {
    render(
      <WorldHeroCard
        world={{ banner_url: "https://x/banner.png", color: null }}
        bodyColor="#f4f4f5"
      />,
    );

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("affiche l'image de bannière quand banner_url est défini", () => {
    const { container } = render(
      <WorldHeroCard
        world={{ banner_url: "https://x/banner.png", color: null }}
        bodyColor="#f4f4f5"
      />,
    );

    expect(container.querySelector("img")).toBeInTheDocument();
  });

  it("utilise la couleur unie du monde en fond quand aucune bannière n'est définie", () => {
    const { container } = render(
      <WorldHeroCard world={{ banner_url: null, color: "#3b82f6" }} bodyColor="#f4f4f5" />,
    );

    const root = container.firstElementChild!;
    expect(root).toHaveStyle({ backgroundColor: "#3b82f6" });
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("remplit tout son conteneur relatif (absolute inset-0) plutôt qu'une hauteur fixe", () => {
    const { container } = render(
      <WorldHeroCard world={{ banner_url: null, color: null }} bodyColor="#f4f4f5" />,
    );

    expect(container.firstElementChild).toHaveClass("absolute", "inset-0");
  });
});
