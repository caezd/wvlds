import { describe, it, expect } from "vitest";
import { extractHeadings } from "@/lib/wikiToc";

describe("extractHeadings", () => {
  it("extrait les titres ATX avec leur niveau", () => {
    expect(extractHeadings("# Titre 1\n## Titre 2\n### Titre 3")).toEqual([
      { level: 1, text: "Titre 1", id: "titre-1" },
      { level: 2, text: "Titre 2", id: "titre-2" },
      { level: 3, text: "Titre 3", id: "titre-3" },
    ]);
  });

  it("ignore le texte qui n'est pas un titre", () => {
    expect(extractHeadings("Un paragraphe normal.\n# Un titre\nEncore du texte.")).toEqual([
      { level: 1, text: "Un titre", id: "un-titre" },
    ]);
  });

  it("déduplique les slugs identiques par occurrence", () => {
    expect(extractHeadings("## Histoire\n## Histoire")).toEqual([
      { level: 2, text: "Histoire", id: "histoire" },
      { level: 2, text: "Histoire", id: "histoire-2" },
    ]);
  });

  it("ignore les titres à l'intérieur d'un bloc de code fencé", () => {
    expect(extractHeadings("```\n# Pas un titre\n```\n# Vrai titre")).toEqual([
      { level: 1, text: "Vrai titre", id: "vrai-titre" },
    ]);
  });

  it("exige un espace après les #", () => {
    expect(extractHeadings("#PasUnTitre\n# Un vrai titre")).toEqual([
      { level: 1, text: "Un vrai titre", id: "un-vrai-titre" },
    ]);
  });

  it("retourne un tableau vide sans titre", () => {
    expect(extractHeadings("Juste du texte.\n\nEt un autre paragraphe.")).toEqual([]);
  });
});
