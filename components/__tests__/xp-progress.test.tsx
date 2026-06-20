import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { XPProgress } from "@/components/gamification/xp-progress";

describe("XPProgress", () => {
  it("calcule le niveau à partir de l'XP (100 XP par niveau)", () => {
    render(<XPProgress xp={250} coins={10} streak={3} />);
    expect(screen.getByText(/Niveau 3/)).toBeInTheDocument();
    expect(screen.getByText(/250 XP/)).toBeInTheDocument();
  });

  it("niveau 1 à 0 XP", () => {
    render(<XPProgress xp={0} coins={0} streak={0} />);
    expect(screen.getByText(/Niveau 1/)).toBeInTheDocument();
  });

  it("affiche la progression dans le niveau courant (largeur de barre)", () => {
    const { container } = render(<XPProgress xp={150} coins={0} streak={0} />);
    // 150 XP → niveau 2, 50 % du niveau parcouru
    const bar = container.querySelector<HTMLElement>(".bg-zinc-900");
    expect(bar?.style.width).toBe("50%");
  });

  it("plafonne la barre à 100 %", () => {
    const { container } = render(<XPProgress xp={99} coins={0} streak={0} />);
    const bar = container.querySelector<HTMLElement>(".bg-zinc-900");
    expect(bar?.style.width).toBe("99%");
  });
});
