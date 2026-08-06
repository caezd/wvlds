import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WikiTableOfContents } from "@/components/worlds/wiki/WikiTableOfContents";
import type { WikiHeading } from "@/lib/wikiToc";

describe("WikiTableOfContents", () => {
  it("ne rend rien avec moins de 2 titres", () => {
    const headings: WikiHeading[] = [{ level: 1, text: "Seul titre", id: "seul-titre" }];
    const { container } = render(<WikiTableOfContents headings={headings} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ne rend rien sans titre", () => {
    const { container } = render(<WikiTableOfContents headings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("liste les titres avec un lien d'ancre vers leur id", () => {
    const headings: WikiHeading[] = [
      { level: 1, text: "Introduction", id: "introduction" },
      { level: 2, text: "Détails", id: "details" },
    ];
    render(<WikiTableOfContents headings={headings} />);

    const intro = screen.getByRole("link", { name: "Introduction" });
    const details = screen.getByRole("link", { name: "Détails" });
    expect(intro).toHaveAttribute("href", "#introduction");
    expect(details).toHaveAttribute("href", "#details");
  });
});
