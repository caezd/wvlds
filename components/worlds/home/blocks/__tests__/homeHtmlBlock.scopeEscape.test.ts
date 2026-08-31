import { describe, it, expect } from "vitest";
import { prepareHomeHtmlBlock, scopeBlockCss } from "@/components/worlds/home/blocks/homeHtmlBlock";

/**
 * Le cloisonnement du CSS d'un bloc tient à une seule chose : la feuille reste
 * DANS son bloc `@scope`. Une accolade fermante en trop le referme, et tout ce
 * qui suit est analysé au niveau de la feuille — donc appliqué à l'application
 * entière, chez chaque membre du monde.
 *
 * La manœuvre ne laisse aucune trace : le `}` final que `scopeBlockCss` ajoute
 * referme obligeamment l'accolade laissée ouverte, si bien que la feuille reste
 * équilibrée. Elle fonctionne aussi dans un navigateur sans `@scope`, où
 * l'at-rule inconnue s'arrête de toute façon à la première accolade fermante.
 */
describe("scopeBlockCss — évasion du bloc @scope", () => {
  it("refuse une feuille qui referme son bloc pour atteindre toute la page", () => {
    const évasion = ["}", "header, nav { display: none !important }", ".leurre {"].join("\n");

    expect(scopeBlockCss(évasion, "bloc")).toBe("");
  });

  // Même sink, autre porte d'entrée : le CSS peut aussi arriver hissé depuis
  // une balise `<style>` du champ HTML, dont le budget de taille est distinct.
  it("refuse aussi l'évasion arrivée par une balise style du HTML", () => {
    const { css } = prepareHomeHtmlBlock({
      html: "<style>} header { display: none }</style><p>x</p>",
      scopeClass: "bloc",
    });

    expect(css).toBe("");
  });

  // Une chaîne CSS se termine à son guillemet fermant, à la fin du texte — ou à
  // un saut de ligne, qui en fait une chaîne invalide. Un compteur qui
  // laisserait un guillemet non refermé courir jusqu'à la fin avalerait les
  // accolades que le navigateur, lui, compte : l'évasion passerait.
  it("compte les accolades qu'un guillemet non refermé ne protège pas", () => {
    const évasion = ['a { content: "x', "}", "}", "header { display: none }"].join("\n");

    expect(scopeBlockCss(évasion, "bloc")).toBe("");
  });

  // L'inverse compte tout autant : une accolade qui n'en est pas une ne doit
  // pas faire rejeter une feuille légitime.
  it("ne compte pas les accolades des chaînes, commentaires et url()", () => {
    for (const légitime of [
      'p::after { content: "}" }',
      "p { color: red } /* } */",
      "p { background: url(image}.png) }",
      'p { content: "\\}" }',
    ]) {
      expect(scopeBlockCss(légitime, "bloc")).toContain("@scope (.bloc)");
    }
  });

  // Un bloc laissé OUVERT n'est pas une évasion : la récupération d'erreur du
  // navigateur le referme en fin de feuille, sans jamais remonter au-dessus du
  // `@scope`. Le refuser priverait de style une faute de frappe anodine.
  it("accepte une feuille qui laisse un bloc ouvert", () => {
    expect(scopeBlockCss("p { color: red", "bloc")).toContain("@scope (.bloc)");
  });

  it("accepte une feuille équilibrée ordinaire", () => {
    expect(scopeBlockCss(":scope { padding: 1rem; }", "bloc")).toContain("@scope (.bloc)");
  });
});
