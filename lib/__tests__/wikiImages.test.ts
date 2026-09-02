import { describe, it, expect } from "vitest";

import { extractImages } from "@/lib/wikiImages";

describe("extractImages", () => {
  it("rend les images dans l'ordre du document", () => {
    expect(extractImages("Avant ![Carte](a.webp) après\n\n![](b.webp)")).toEqual([
      { alt: "Carte", url: "a.webp" },
      { alt: "", url: "b.webp" },
    ]);
  });

  it("saute les blocs de code", () => {
    // Un `![](…)` montré en exemple documente une syntaxe, il n'illustre rien.
    const md = "![Vraie](a.webp)\n```\n![Exemple](b.webp)\n```\n";
    expect(extractImages(md).map(i => i.url)).toEqual(["a.webp"]);
  });

  it("distingue une image d'un lien", () => {
    expect(extractImages("[Texte](a.webp) et ![Image](b.webp)").map(i => i.url))
      .toEqual(["b.webp"]);
  });

  it("supporte un contenu vide", () => {
    expect(extractImages("")).toEqual([]);
  });
});
