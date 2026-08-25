import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageGridView } from "@/components/personas/ImageGridView";
import type { PersonaGridImage } from "@/types/personas";

describe("ImageGridView", () => {
  it("ne rend rien pour une liste vide", () => {
    const { container } = render(<ImageGridView images={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("positionne chaque image selon x/y/w déjà résolus", () => {
    const images: PersonaGridImage[] = [
      { id: "a", url: "https://x/a.png", x: 0, y: 0, w: 4 },
      { id: "b", url: "https://x/b.png", x: 4, y: 0, w: 2 },
    ];
    render(<ImageGridView images={images} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    const cellA = buttons[0].parentElement as HTMLElement;
    const cellB = buttons[1].parentElement as HTMLElement;
    expect(cellA.style.getPropertyValue("--gc")).toBe("1 / span 4");
    expect(cellB.style.getPropertyValue("--gc")).toBe("5 / span 2");
  });

  it("place automatiquement une image sans position (legacy, sans x/y/w)", () => {
    const images: PersonaGridImage[] = [{ id: "a", url: "https://x/a.png" }];
    render(<ImageGridView images={images} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("ouvre la visionneuse au clic sur une image", async () => {
    const images: PersonaGridImage[] = [{ id: "a", url: "https://x/a.png", x: 0, y: 0, w: 3 }];
    render(<ImageGridView images={images} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    // La visionneuse (ImageLightbox) porte un lien de téléchargement — absent
    // avant le clic, présent une fois ouverte.
    expect(screen.getByRole("link")).toBeInTheDocument();
  });
});
