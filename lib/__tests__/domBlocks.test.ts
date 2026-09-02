import { describe, it, expect } from "vitest";
import { blockIndexOfNode, collectBlocks } from "@/lib/domBlocks";

function rendu(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("collectBlocks", () => {
  it("découpe paragraphes, titres et éléments de liste", () => {
    const blocs = collectBlocks(rendu(`
      <h2>Meridian</h2>
      <p>Mara Kline observe la ville.</p>
      <ul><li>Le Hub</li><li>Le quartier haut</li></ul>
    `));

    expect(blocs.map(b => [b.type, b.text])).toEqual([
      ["h2", "Meridian"],
      ["p", "Mara Kline observe la ville."],
      ["li", "Le Hub"],
      ["li", "Le quartier haut"],
    ]);
  });

  it("garde le texte des marques d'un bloc", () => {
    const blocs = collectBlocks(rendu("<p>Un <strong>mot</strong> ici</p>"));
    expect(blocs.map(b => b.text)).toEqual(["Un mot ici"]);
  });

  it("ne compte pas deux fois une citation et son paragraphe", () => {
    // La citation n'a pas de texte propre : seul le paragraphe est un bloc.
    const blocs = collectBlocks(rendu("<blockquote><p>Cité</p></blockquote>"));
    expect(blocs.map(b => [b.type, b.text])).toEqual([["p", "Cité"]]);
  });

  it("compte séparément un élément de liste et sa sous-liste", () => {
    const blocs = collectBlocks(rendu("<ul><li>Parent<ul><li>Enfant</li></ul></li></ul>"));
    expect(blocs.map(b => b.text)).toEqual(["Parent", "Enfant"]);
  });

  it("écarte ce qui n'appartient pas au texte", () => {
    // Le bouton « Copier » d'un bloc de code : son libellé change au clic, et
    // le compter décalerait l'ancrage de tout ce qui suit.
    const blocs = collectBlocks(rendu(`
      <pre>du code<button data-annotate-ignore>Copier</button></pre>
      <p>Après.</p>
    `));
    expect(blocs.map(b => b.text)).toEqual(["du code", "Après."]);
  });

  it("ignore les blocs sans texte", () => {
    expect(collectBlocks(rendu("<p></p><p>   </p><p>Vrai</p>")).map(b => b.text)).toEqual(["Vrai"]);
  });

  it("réduit les espaces du rendu", () => {
    expect(collectBlocks(rendu("<p>Un\n  texte   coupé</p>"))[0].text).toBe("Un texte coupé");
  });
});

describe("blockIndexOfNode", () => {
  it("trouve le bloc qui contient un nœud texte", () => {
    const root = rendu("<p>Un</p><p>Deux <em>trois</em></p>");
    const blocs = collectBlocks(root);
    const em = root.querySelector("em")!;

    expect(blockIndexOfNode(blocs, em.firstChild!)).toBe(1);
  });

  it("retient le bloc le plus proche", () => {
    const root = rendu("<ul><li>Parent<ul><li>Enfant</li></ul></li></ul>");
    const blocs = collectBlocks(root);
    const interne = root.querySelectorAll("li")[1];

    expect(blockIndexOfNode(blocs, interne.firstChild!)).toBe(1);
  });

  it("rend -1 hors de tout bloc", () => {
    const root = rendu("<div>Libre</div>");
    expect(blockIndexOfNode(collectBlocks(root), root.firstChild!)).toBe(-1);
  });
});
