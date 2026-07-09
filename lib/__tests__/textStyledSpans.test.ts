import { describe, it, expect } from "vitest";
import { transformStyledSpans } from "@/lib/textStyledSpans";

describe("transformStyledSpans", () => {
  it("transforme un span couleur en lien color:", () => {
    expect(transformStyledSpans("$#ff0000$texte rouge$$")).toBe("[texte rouge](color:ff0000)");
  });

  it("transforme un span souligné en lien underline:", () => {
    expect(transformStyledSpans("++texte souligné++")).toBe("[texte souligné](underline:)");
  });

  it("accepte les hex courts (3 chiffres)", () => {
    expect(transformStyledSpans("$#f00$rouge$$")).toBe("[rouge](color:f00)");
  });

  it("laisse le texte autour intact", () => {
    expect(transformStyledSpans("avant $#00ff00$vert$$ après")).toBe("avant [vert](color:00ff00) après");
  });

  it("gère plusieurs spans sur la même ligne", () => {
    expect(transformStyledSpans("$#ff0000$a$$ et ++b++")).toBe("[a](color:ff0000) et [b](underline:)");
  });

  it("préserve le markdown imbriqué à l'intérieur du span", () => {
    expect(transformStyledSpans("$#ff0000$**gras rouge**$$")).toBe("[**gras rouge**](color:ff0000)");
  });

  it("laisse un marqueur non fermé tel quel", () => {
    expect(transformStyledSpans("$#ff0000$jamais fermé")).toBe("$#ff0000$jamais fermé");
  });

  it("laisse un span vide tel quel plutôt que de créer un lien vide", () => {
    expect(transformStyledSpans("$#ff0000$$$")).toBe("$#ff0000$$$");
  });

  it("ignore un token invalide (hex mal formé)", () => {
    expect(transformStyledSpans("$#zzz$texte$$")).toBe("$#zzz$texte$$");
  });

  it("ne transforme pas à l'intérieur d'un bloc de code fenced", () => {
    const input = "```\n$#ff0000$pas transformé$$\n```";
    expect(transformStyledSpans(input)).toBe(input);
  });

  it("continue de transformer après la fin d'un bloc de code", () => {
    const input = "```\n$#ff0000$code$$\n```\n$#ff0000$transformé$$";
    const result = transformStyledSpans(input);
    expect(result).toContain("$#ff0000$code$$");
    expect(result).toContain("[transformé](color:ff0000)");
  });

  it("ne traverse pas les sauts de ligne", () => {
    const input = "$#ff0000$ligne un\nligne deux$$";
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
});
