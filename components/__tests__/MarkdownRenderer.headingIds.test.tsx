import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { MarkdownContent } from "@/components/MarkdownRenderer";

describe("MarkdownContent — ids d'ancre sur les titres", () => {
  it("pose un id slugifié sur chaque titre, dans l'ordre du document", () => {
    const { container } = render(
      <MarkdownContent content={"# Premier titre\n\nTexte.\n\n## Second titre"} />,
    );
    const h1 = container.querySelector("h1");
    const h2 = container.querySelector("h2");
    expect(h1?.id).toBe("premier-titre");
    expect(h2?.id).toBe("second-titre");
  });

  it("déduplique l'id de deux titres identiques", () => {
    const { container } = render(
      <MarkdownContent content={"## Histoire\n\nA.\n\n## Histoire\n\nB."} />,
    );
    const headings = Array.from(container.querySelectorAll("h2"));
    expect(headings.map(h => h.id)).toEqual(["histoire", "histoire-2"]);
  });
});
