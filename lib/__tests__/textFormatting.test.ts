import { describe, it, expect } from "vitest";
import { wrapSelection, applyListPrefix, applyHeadingPrefix } from "@/lib/textFormatting";

describe("wrapSelection", () => {
  it("enveloppe une sélection non vide et place le curseur après", () => {
    const result = wrapSelection("Bonjour monde", 0, 7, "**", "**");
    expect(result.text).toBe("**Bonjour** monde");
    expect(result.cursorStart).toBe(11);
    expect(result.cursorEnd).toBe(11);
  });

  it("insère la paire de marqueurs et place le curseur entre les deux sans sélection", () => {
    const result = wrapSelection("Bonjour ", 8, 8, "**", "**");
    expect(result.text).toBe("Bonjour ****");
    expect(result.cursorStart).toBe(10);
    expect(result.cursorEnd).toBe(10);
  });

  it("fonctionne au milieu du texte avec des marqueurs asymétriques (lien)", () => {
    const result = wrapSelection("clique ici pour voir", 7, 10, "[", "](https://)");
    expect(result.text).toBe("clique [ici](https://) pour voir");
    expect(result.cursorStart).toBe(22);
  });

  it("gère une sélection en tout début de texte", () => {
    const result = wrapSelection("gras", 0, 4, "**", "**");
    expect(result.text).toBe("**gras**");
  });
});

describe("applyListPrefix", () => {
  it("préfixe une seule ligne sélectionnée", () => {
    const result = applyListPrefix("une ligne", 0, 9);
    expect(result.text).toBe("- une ligne");
    expect(result.cursorStart).toBe(0);
    expect(result.cursorEnd).toBe(11);
  });

  it("ne préfixe que la ligne touchée par la sélection, pas les lignes voisines", () => {
    const text = "premier\ndeuxième\ntroisième";
    const start = text.indexOf("deuxième");
    const end = start + "deuxième".length;
    const result = applyListPrefix(text, start, end);
    expect(result.text).toBe("premier\n- deuxième\ntroisième");
  });

  it("préfixe plusieurs lignes quand la sélection s'étend sur tout le bloc", () => {
    const text = "premier\ndeuxième\ntroisième";
    const result = applyListPrefix(text, 0, text.length);
    expect(result.text).toBe("- premier\n- deuxième\n- troisième");
  });

  it("ignore les lignes vides à l'intérieur du bloc", () => {
    const text = "a\n\nb";
    const result = applyListPrefix(text, 0, text.length);
    expect(result.text).toBe("- a\n\n- b");
  });

  it("étend la sélection à la ligne entière même avec un curseur collapsed", () => {
    const text = "bonjour le monde";
    const result = applyListPrefix(text, 5, 5);
    expect(result.text).toBe("- bonjour le monde");
  });
});

describe("applyHeadingPrefix", () => {
  it("préfixe un paragraphe sans titre existant", () => {
    const result = applyHeadingPrefix("Titre", 2);
    expect(result.text).toBe("## Titre");
  });

  it("remplace un niveau de titre existant par le nouveau plutôt que de l'empiler", () => {
    const result = applyHeadingPrefix("## Titre", 1);
    expect(result.text).toBe("# Titre");
  });

  it("bascule (retire le marqueur) en repassant le même niveau", () => {
    const result = applyHeadingPrefix("## Titre", 2);
    expect(result.text).toBe("Titre");
  });

  it("transforme le paragraphe entier, y compris les sauts de ligne internes (Maj+Entrée)", () => {
    const result = applyHeadingPrefix("première ligne\ndeuxième ligne", 3);
    expect(result.text).toBe("### première ligne\ndeuxième ligne");
  });

  it("ne fait rien sur un paragraphe vide", () => {
    const result = applyHeadingPrefix("", 1);
    expect(result.text).toBe("");
  });
});
