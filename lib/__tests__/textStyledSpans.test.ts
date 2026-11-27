import { describe, it, expect } from "vitest";
import { transformStyledSpans } from "@/lib/textStyledSpans";

describe("transformStyledSpans", () => {
  it("transforme un span couleur en lien color:", () => {
    expect(transformStyledSpans("[#ff0000]texte rouge[/]")).toBe("[texte rouge](color:ff0000)");
  });

  it("transforme un span souligné en lien underline:", () => {
    expect(transformStyledSpans("++texte souligné++")).toBe("[texte souligné](underline:)");
  });

  it("accepte les hex courts (3 chiffres)", () => {
    expect(transformStyledSpans("[#f00]rouge[/]")).toBe("[rouge](color:f00)");
  });

  it("laisse le texte autour intact", () => {
    expect(transformStyledSpans("avant [#00ff00]vert[/] après")).toBe("avant [vert](color:00ff00) après");
  });

  it("gère plusieurs spans sur la même ligne", () => {
    expect(transformStyledSpans("[#ff0000]a[/] et ++b++")).toBe("[a](color:ff0000) et [b](underline:)");
  });

  it("préserve le markdown imbriqué à l'intérieur du span", () => {
    expect(transformStyledSpans("[#ff0000]**gras rouge**[/]")).toBe("[**gras rouge**](color:ff0000)");
  });

  it("laisse un marqueur non fermé tel quel", () => {
    expect(transformStyledSpans("[#ff0000]jamais fermé")).toBe("[#ff0000]jamais fermé");
  });

  it("laisse un span vide tel quel plutôt que de créer un lien vide", () => {
    expect(transformStyledSpans("[#ff0000][/]")).toBe("[#ff0000][/]");
  });

  it("ignore un token invalide (hex mal formé)", () => {
    expect(transformStyledSpans("[#zzz]texte[/]")).toBe("[#zzz]texte[/]");
  });

  it("ne transforme pas à l'intérieur d'un bloc de code fenced", () => {
    const input = "```\n[#ff0000]pas transformé[/]\n```";
    expect(transformStyledSpans(input)).toBe(input);
  });

  it("continue de transformer après la fin d'un bloc de code", () => {
    const input = "```\n[#ff0000]code[/]\n```\n[#ff0000]transformé[/]";
    const result = transformStyledSpans(input);
    expect(result).toContain("[#ff0000]code[/]");
    expect(result).toContain("[transformé](color:ff0000)");
  });

  it("ne traverse pas les sauts de ligne", () => {
    const input = "[#ff0000]ligne un\nligne deux[/]";
    expect(transformStyledSpans(input)).toBe(input);
  });

  it("ne transforme pas à l'intérieur d'un bloc de code fenced (souligné)", () => {
    const input = "```\n++pas transformé++\n```";
    expect(transformStyledSpans(input)).toBe(input);
  });

  it("ne traverse pas les sauts de ligne (souligné)", () => {
    const input = "++ligne un\nligne deux++";
    expect(transformStyledSpans(input)).toBe(input);
  });

  it("ne confond pas un vrai lien markdown [texte](url) avec la syntaxe couleur", () => {
    expect(transformStyledSpans("[site](https://example.com)")).toBe("[site](https://example.com)");
  });

  it("un souligné imbriqué dans une couleur ne produit pas de lien markdown imbriqué (invalide)", () => {
    // CommonMark ne supporte pas les liens imbriqués : le marqueur englobant
    // (couleur) l'emporte, celui de l'intérieur (souligné) reste littéral —
    // plutôt que ["[x](underline:)"](color:f00) qui casserait le rendu.
    const result = transformStyledSpans("[#f00]++x++[/]");
    expect(result).toBe("[++x++](color:f00)");
    expect(result).not.toContain("(underline:)");
  });

  it("une couleur imbriquée dans un souligné ne produit pas de lien markdown imbriqué (invalide)", () => {
    const result = transformStyledSpans("++[#f00]x[/]++");
    expect(result).toBe("[[#f00]x[/]](underline:)");
    expect(result).not.toContain("(color:f00)");
  });

  it("ne transforme pas un marqueur à l'intérieur d'un extrait de code inline", () => {
    expect(transformStyledSpans("Le marqueur `[#ff0000]texte[/]` sert à colorer.")).toBe(
      "Le marqueur `[#ff0000]texte[/]` sert à colorer.",
    );
    expect(transformStyledSpans("Et `++texte++` pour le souligné.")).toBe(
      "Et `++texte++` pour le souligné.",
    );
  });

  it("continue de transformer un marqueur hors code, sur une ligne qui contient aussi du code inline", () => {
    expect(transformStyledSpans("`[#hex]` est le marqueur, ex: [#ff0000]rouge[/]")).toBe(
      "`[#hex]` est le marqueur, ex: [rouge](color:ff0000)",
    );
  });

  // Markdown ne ferme pas un `**` précédé d'une espace : les messages déjà
  // écrits ainsi s'affichent quand même en gras.
  describe("espace avant le marqueur fermant", () => {
    it("gras, italique et barré : l'espace sort du marqueur", () => {
      expect(transformStyledSpans("en **bold **blabla")).toBe("en **bold** blabla");
      expect(transformStyledSpans("le **bold ** marche")).toBe("le **bold**  marche");
      expect(transformStyledSpans("en __gras __ici")).toBe("en __gras__ ici");
      expect(transformStyledSpans("en *talic *ici")).toBe("en *talic* ici");
      expect(transformStyledSpans("en _talic _ici")).toBe("en _talic_ ici");
      expect(transformStyledSpans("en ~~barré ~~ici")).toBe("en ~~barré~~ ici");
    });

    it("le reste ne change pas", () => {
      for (const texte of ["**gras** et *italique*", "5 * 3 * 2", "* une puce *", "snake_case et foo _bar", "**a** b **c**"]) {
        expect(transformStyledSpans(texte)).toBe(texte);
      }
    });

    it("pas dans le code", () => {
      expect(transformStyledSpans("`**bold **`")).toBe("`**bold **`");
      expect(transformStyledSpans("```\n**bold **\n```")).toBe("```\n**bold **\n```");
    });
  });

  // Markdown ne fait pas traverser une emphase d'un paragraphe à l'autre :
  // elle se referme et se rouvre à chaque paragraphe qu'elle couvre.
  describe("emphase sur plusieurs paragraphes", () => {
    it("ouverte dans un paragraphe, fermée à la fin d'un suivant", () => {
      expect(transformStyledSpans("*Premier paragraphe.\n\nDeuxième.*")).toBe("*Premier paragraphe.*\n\n*Deuxième.*");
      expect(transformStyledSpans("**Un\n\nDeux\n\nTrois**")).toBe("**Un**\n\n**Deux**\n\n**Trois**");
      expect(transformStyledSpans("Il dit _bonjour\n\npuis s'en va_ vite.")).toBe("Il dit _bonjour_\n\n_puis s'en va_ vite.");
      expect(transformStyledSpans("~~a\n\nb~~")).toBe("~~a~~\n\n~~b~~");
    });

    it("un paragraphe sur plusieurs lignes reste entier", () => {
      expect(transformStyledSpans("*Un\nsuite\n\nDeux*")).toBe("*Un\nsuite*\n\n*Deux*");
    });

    it("une emphase fermée dans son paragraphe, ou jamais fermée, ne change pas", () => {
      for (const texte of ["*a* b\n\nc *d*", "*a\n\nb", "a\n\nb*", "5 * 3\n\n2 * 4", "*a\n\n- b\n- c*"]) {
        expect(transformStyledSpans(texte)).toBe(texte);
      }
    });

    it("pas à travers un bloc de code", () => {
      const texte = "*a\n\n```\nx\n```\n\nb*";
      expect(transformStyledSpans(texte)).toBe(texte);
      expect(transformStyledSpans("`*a`\n\n`b*`")).toBe("`*a`\n\n`b*`");
    });
  });
});
