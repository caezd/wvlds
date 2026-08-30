import { describe, it, expect } from "vitest";
import { toHtml } from "hast-util-to-html";
import {
  blockScopeClass,
  neutralizeStyleClose,
  prepareHomeHtmlBlock,
  scopeBlockCss,
} from "@/components/worlds/home/blocks/homeHtmlBlock";

/**
 * Ces tests sont la garantie de sécurité du bloc HTML libre.
 *
 * Le contenu vient d'un admin de monde et s'affiche chez tous ses membres ;
 * depuis le retrait de l'iframe, rien d'autre que cet assainissement ne
 * s'interpose. Chaque cas ci-dessous correspond à un vecteur réel, pas à une
 * hypothèse — un `<script>`, un gestionnaire d'événement, une URL
 * `javascript:`, un élément qui réintroduit un document arbitraire.
 */
function rendu(html: string, css?: string): string {
  return toHtml(prepareHomeHtmlBlock({ html, css, scopeClass: "bloc" }).tree);
}

describe("prepareHomeHtmlBlock — ce qui ne doit jamais passer", () => {
  it("retire une balise script et son contenu", () => {
    const out = rendu("<p>Salut</p><script>alert(1)</script>");
    expect(out).toContain("Salut");
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert");
  });

  // La raison pour laquelle une liste noire ne suffirait pas : ces attributs
  // se comptent par centaines et la spec en ajoute à chaque version. Aucun
  // n'est listé, donc aucun ne survit — y compris ceux qu'on n'a pas prévus.
  it("retire tout attribut de gestionnaire d'événement", () => {
    const out = rendu(
      '<img src="https://x/y.png" onerror="alert(1)">' +
        '<div onclick="alert(2)" onanimationstart="alert(3)" onfocusin="alert(4)">x</div>',
    );
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onanimationstart");
    expect(out).not.toContain("onfocusin");
    expect(out).not.toContain("alert");
  });

  it("retire un href javascript: tout en gardant un lien http", () => {
    const out = rendu('<a href="javascript:alert(1)">x</a><a href="https://exemple.fr">y</a>');
    expect(out).not.toContain("javascript");
    expect(out).toContain("https://exemple.fr");
  });

  it("retire les éléments qui réintroduiraient un document arbitraire", () => {
    const out = rendu(
      '<iframe src="https://x"></iframe><object data="x"></object><embed src="x">' +
        '<form action="/x"><input name="mot-de-passe"></form>' +
        '<svg><a xlink:href="javascript:alert(1)">x</a></svg>' +
        '<link rel="stylesheet" href="https://x/y.css"><meta http-equiv="refresh" content="0">',
    );
    for (const balise of ["iframe", "object", "embed", "form", "input", "svg", "link", "meta"]) {
      expect(out).not.toContain(`<${balise}`);
    }
  });

  // Un bloc pouvant poser `id="thread"` (voir AppShell.tsx) détournerait un
  // `getElementById` de l'application, ou ferait apparaître une propriété du
  // même nom sur `window`.
  it("retire l'attribut id", () => {
    expect(rendu('<div id="thread">x</div>')).not.toContain("id=");
  });

  it("refuse une source d'image en data: — data:text/html y ferait rentrer du HTML", () => {
    const out = rendu('<img src="data:text/html;base64,PHNjcmlwdD4=" alt="x">');
    expect(out).not.toContain("data:");
  });
});

describe("prepareHomeHtmlBlock — ce qui doit passer", () => {
  it("garde le balisage de mise en page et ses classes et styles", () => {
    const out = rendu('<div class="encart" style="padding:1rem"><h2>Titre</h2><p>Texte</p></div>');
    expect(out).toContain('class="encart"');
    expect(out).toContain('style="padding:1rem"');
    expect(out).toContain("<h2>Titre</h2>");
  });

  it("garde un tableau complet et ses attributs de fusion", () => {
    const out = rendu('<table><tr><th colspan="2">x</th></tr><tr><td>y</td></tr></table>');
    expect(out).toContain("<table>");
    expect(out).toContain('colspan="2"');
  });
});

describe("prepareHomeHtmlBlock — feuille de style", () => {
  it("enferme le CSS dans un @scope sur la classe du bloc", () => {
    const { css } = prepareHomeHtmlBlock({ html: "<p>x</p>", css: ":scope { color: red; }", scopeClass: "bloc" });
    expect(css).toContain("@scope (.bloc)");
    expect(css).toContain("color: red;");
  });

  it("ne produit aucune feuille quand il n'y a pas de style", () => {
    expect(prepareHomeHtmlBlock({ html: "<p>x</p>", scopeClass: "bloc" }).css).toBe("");
    expect(prepareHomeHtmlBlock({ html: "<p>x</p>", css: "   ", scopeClass: "bloc" }).css).toBe("");
  });

  // Tous les blocs écrits avant l'existence du champ CSS portent leur feuille
  // dans une balise `<style>` au milieu du HTML. La liste blanche la
  // supprimerait : on la hisse d'abord, ce qui préserve leur apparence et la
  // fait passer par le même cloisonnement.
  it("hisse le contenu d'une balise style du HTML vers la feuille scopée", () => {
    const { tree, css } = prepareHomeHtmlBlock({
      html: "<style>p { color: blue; }</style><p>x</p>",
      scopeClass: "bloc",
    });
    expect(toHtml(tree)).not.toContain("<style");
    expect(toHtml(tree)).toContain("<p>x</p>");
    expect(css).toContain("@scope (.bloc)");
    expect(css).toContain("color: blue;");
  });

  it("hisse aussi une balise style imbriquée, et fait passer le champ dédié en dernier", () => {
    const { css } = prepareHomeHtmlBlock({
      html: "<div><style>p { color: blue; }</style><p>x</p></div>",
      css: "p { color: green; }",
      scopeClass: "bloc",
    });
    expect(css.indexOf("blue")).toBeLessThan(css.indexOf("green"));
  });

  // Seule évasion possible depuis l'intérieur d'une balise `<style>` : refermer
  // l'élément pour que la suite soit analysée comme du balisage.
  it("neutralise une tentative de fermeture de la balise style", () => {
    const { css } = prepareHomeHtmlBlock({
      html: "<p>x</p>",
      css: "p{} </style><script>alert(1)</script>",
      scopeClass: "bloc",
    });
    expect(css).not.toContain("</style>");
    expect(css).not.toContain("</script>");
    expect(neutralizeStyleClose("a </b> c")).toBe("a <\\/b> c");
  });

  it("scopeBlockCss rend une chaîne vide pour un CSS vide", () => {
    expect(scopeBlockCss("   ", "bloc")).toBe("");
  });
});

describe("blockScopeClass", () => {
  it("dérive une classe de l'id du bloc", () => {
    expect(blockScopeClass("abc-123")).toBe("wvlds-hb-abc-123");
  });

  // Les ids viennent de `crypto.randomUUID()`, mais la base peut contenir
  // n'importe quelle chaîne : ce qui ne peut pas figurer dans un sélecteur de
  // classe est remplacé, et le préfixe évite un identifiant commençant par un
  // chiffre.
  it("remplace ce qui n'est pas valide dans un sélecteur de classe", () => {
    expect(blockScopeClass('a b".c')).toBe("wvlds-hb-a-b--c");
    expect(blockScopeClass("1")).toBe("wvlds-hb-1");
  });
});
