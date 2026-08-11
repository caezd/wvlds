import { describe, it, expect } from "vitest";
import { markdownToPlainText } from "@/lib/markdownToPlainText";

describe("markdownToPlainText", () => {
  it("retire la syntaxe markdown de base (gras, italique, liens)", () => {
    expect(markdownToPlainText("**gras** et *italique* et [un lien](https://example.com)")).toBe(
      "gras et italique et un lien",
    );
  });

  it("retire les marqueurs de titres et de listes", () => {
    expect(markdownToPlainText("# Titre\n\n- item un\n- item deux")).toBe(
      "Titre\n\nitem un\n\nitem deux",
    );
  });

  it("dépouille les spans stylés de couleur ([#hex]…[/]) en gardant le texte", () => {
    expect(markdownToPlainText("Un [#ff0000]texte rouge[/] normal")).toBe("Un texte rouge normal");
  });

  it("dépouille les spans soulignés (++…++) en gardant le texte", () => {
    expect(markdownToPlainText("Du ++texte souligné++ ici")).toBe("Du texte souligné ici");
  });

  it("garde le contenu textuel d'un callout <<…>>", () => {
    expect(markdownToPlainText("Avant\n\n<<Une pensée secrète>>\n\nAprès")).toBe(
      "Avant\n\nUne pensée secrète\n\nAprès",
    );
  });

  it("n'interprète pas de marqueur stylé à l'intérieur d'un extrait de code inline", () => {
    // stripMarkdown déballe aussi le formatage "code" ; remark-stringify échappe
    // ensuite `[`/`]` par sécurité de round-trip — le texte reste néanmoins celui
    // tapé, sans qu'aucun span [#hex]…[/] n'ait été interprété au passage.
    expect(markdownToPlainText("Tape `[#ff0000]texte[/]` pour du rouge")).toBe(
      "Tape \\[#ff0000]texte\\[/] pour du rouge",
    );
  });
});
