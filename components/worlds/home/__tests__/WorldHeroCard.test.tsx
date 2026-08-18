import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { WorldHeroCard } from "@/components/worlds/home/WorldHeroCard";

describe("WorldHeroCard", () => {
  it("n'affiche plus de titre ni de description superposés (déplacés dans WorldHome)", () => {
    render(<WorldHeroCard world={{ banner_url: "https://x/banner.png", color: null }} />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("affiche l'image de bannière quand banner_url est défini", () => {
    const { container } = render(<WorldHeroCard world={{ banner_url: "https://x/banner.png", color: null }} />);

    expect(container.querySelector("img")).toBeInTheDocument();
  });

  it("utilise la couleur unie du monde en fond quand aucune bannière n'est définie", () => {
    const { container } = render(<WorldHeroCard world={{ banner_url: null, color: "#3b82f6" }} />);

    const root = container.firstElementChild!;
    expect(root).toHaveStyle({ backgroundColor: "#3b82f6" });
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("remplit tout son conteneur relatif (absolute inset-0) plutôt qu'une hauteur fixe", () => {
    const { container } = render(<WorldHeroCard world={{ banner_url: null, color: null }} />);

    expect(container.firstElementChild).toHaveClass("absolute", "inset-0");
  });

  it("s'estompe en transparence (mask-image), pas en peignant une couleur de fond fixe", () => {
    // Régression : peindre `var(--background)` en dur ici cassait sur mobile,
    // où le fond ambiant de l'app n'est pas ce token (voir AppShell.tsx).
    const { container } = render(<WorldHeroCard world={{ banner_url: null, color: null }} />);

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/\[mask-image:linear-gradient/);
    expect(root.getAttribute("style") ?? "").not.toContain("background-color");
  });
});
