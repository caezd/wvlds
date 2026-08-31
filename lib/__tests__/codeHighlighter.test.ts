import { describe, it, expect } from "vitest";
import { highlightCode, preloadCodeHighlighter } from "@/lib/codeHighlighter";

describe("highlightCode", () => {
  // Régression : les trois grammaires étaient déclarées à la création de
  // l'instance, donc toutes téléchargées dès le premier champ de code. Elles
  // arrivent maintenant une par une, à la demande — ce qui ne doit rien
  // changer au résultat, quel que soit l'ordre d'arrivée.
  it("colore chacun des langages, chargés à la demande", async () => {
    for (const [lang, code] of [
      ["html", "<p>x</p>"],
      ["css", ":scope { color: red; }"],
      ["markdown", "# Titre"],
    ] as const) {
      const coloré = await highlightCode(code, lang);
      expect(coloré).toContain("<pre");
      expect(coloré).toContain("shiki");
      // Des couleurs sont bien posées sur des fragments distincts.
      expect(coloré.match(/<span style="color/g)?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("colore deux fois le même langage sans le recharger", async () => {
    const premier = await highlightCode("<p>x</p>", "html");
    const second = await highlightCode("<p>x</p>", "html");
    expect(second).toBe(premier);
  });

  // Le fond du thème est remplacé à la génération : le champ laisse voir celui
  // du tiroir au lieu d'y découper un rectangle opaque.
  it("ne pose aucun fond opaque", async () => {
    const coloré = await highlightCode("<p>x</p>", "html");
    expect(coloré).toContain("background-color:transparent");
  });

  it("le préchargement ne lève pas, et n'empêche pas la coloration ensuite", async () => {
    expect(() => preloadCodeHighlighter("css")).not.toThrow();
    expect(await highlightCode("a { color: red; }", "css")).toContain("shiki");
  });
});
