import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { MarkdownContent } from "@/components/MarkdownRenderer";

// Contrat de rendu des blocs de code.
//
// `rehype-highlight` a été retiré de la chaîne de plugins : il posait des
// classes `hljs` / `hljs-*` sur le <code> et sur des <span> internes, mais
// `rehypeSanitize` tourne juste après et n'autorise `className` sur `code` que
// pour `/^language-[\w-]+$/` (ni `hljs`, ni aucune classe sur `span`). Toute la
// coloration était donc supprimée avant l'affichage — et aucune feuille de
// style du projet ne définit `hljs-*` — mais il embarquait ~35 grammaires
// (lowlight) dans le chunk de chaque message et laissait derrière lui des
// <span> vides qui fragmentaient le code pour rien (vérifié : avant retrait,
// un `const a = 1;` produisait 2 spans sans aucune classe).
//
// Ces tests verrouillent le rendu attendu, pour que la réintroduction d'une
// coloration syntaxique passe par une décision explicite (plugin + CSS +
// assouplissement du schéma de sanitize) plutôt que par un import silencieux.
describe("MarkdownContent — blocs de code", () => {
  const fenced = "```js\nconst a = 1;\n```";

  it("rend un bloc de code fencé avec son contenu intact", () => {
    const { container } = render(<MarkdownContent content={fenced} />);
    const code = container.querySelector("code");
    expect(code?.textContent).toContain("const a = 1;");
  });

  it("conserve la classe language-* du fence", () => {
    const { container } = render(<MarkdownContent content={fenced} />);
    const code = container.querySelector("code");
    expect(code?.className).toContain("language-js");
  });

  it("n'émet aucune classe hljs (elles étaient supprimées par le sanitize)", () => {
    const { container } = render(<MarkdownContent content={fenced} />);
    expect(container.querySelectorAll("[class*='hljs']")).toHaveLength(0);
  });

  it("ne découpe pas le code en spans de coloration", () => {
    const { container } = render(<MarkdownContent content={fenced} />);
    const code = container.querySelector("code");
    expect(code?.querySelectorAll("span")).toHaveLength(0);
  });

  it("rend le code inline sans classe de langage", () => {
    const { container } = render(<MarkdownContent content="du `code` inline" />);
    const code = container.querySelector("code");
    expect(code?.textContent).toBe("code");
    expect(code?.className ?? "").not.toContain("hljs");
  });
});
