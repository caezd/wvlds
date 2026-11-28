import { describe, it, expect } from "vitest";
import { StrictMode } from "react";
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

  // En développement, React rend chaque composant deux fois (mode strict) :
  // l'id ne doit pas dépendre d'un compteur incrémenté pendant le rendu, sinon
  // le client ne retrouve pas celui du serveur (erreur d'hydratation).
  it("en mode strict, chaque titre garde son id", () => {
    const { container } = render(
      <StrictMode>
        <MarkdownContent content={"## autre test\n\nTexte.\n\n### Suite"} />
      </StrictMode>,
    );
    expect(container.querySelector("h2")?.id).toBe("autre-test");
    expect(container.querySelector("h3")?.id).toBe("suite");
  });
});
