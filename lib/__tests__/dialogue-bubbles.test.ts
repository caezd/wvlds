import { describe, it, expect } from "vitest";
import { parseDialogue, type DialoguePart } from "@/lib/dialogue-bubbles";

const dialogue = (speech: string, incise: string | null = null): DialoguePart => ({
  kind: "dialogue",
  speech,
  incise,
});
const prose = (text: string): DialoguePart => ({ kind: "prose", text });

describe("parseDialogue", () => {
  it("retourne un tableau vide pour une chaîne vide ou blanche", () => {
    expect(parseDialogue("")).toEqual([]);
    expect(parseDialogue("   \n\n  ")).toEqual([]);
  });

  it("traite un texte sans guillemets comme de la prose", () => {
    expect(parseDialogue("Il marchait dans la nuit.")).toEqual([
      prose("Il marchait dans la nuit."),
    ]);
  });

  it("extrait un dialogue entre guillemets droits sans incise", () => {
    expect(parseDialogue('"Bonjour"')).toEqual([dialogue("Bonjour", null)]);
  });

  it("extrait un dialogue avec guillemets français « »", () => {
    expect(parseDialogue("« Bonjour »")).toEqual([dialogue("Bonjour", null)]);
  });

  it("capture l'incise qui suit un dialogue", () => {
    expect(parseDialogue('"Bonjour", dit-il.')).toEqual([
      dialogue("Bonjour", ", dit-il."),
    ]);
  });

  it("sépare prose initiale puis dialogue", () => {
    expect(parseDialogue('Il sourit. "Salut"')).toEqual([
      prose("Il sourit."),
      dialogue("Salut", null),
    ]);
  });

  it("gère plusieurs dialogues dans un même paragraphe", () => {
    expect(parseDialogue('"Un" puis "Deux"')).toEqual([
      dialogue("Un", "puis"),
      dialogue("Deux", null),
    ]);
  });

  it("traite un guillemet ouvert mais jamais fermé comme de la prose", () => {
    expect(parseDialogue('"Bonjour sans fin')).toEqual([
      prose('"Bonjour sans fin'),
    ]);
  });

  it("sépare les paragraphes (double saut de ligne)", () => {
    expect(parseDialogue('"Un"\n\n"Deux"')).toEqual([
      dialogue("Un", null),
      dialogue("Deux", null),
    ]);
  });

  it("ne crée pas d'incise vide (retourne null)", () => {
    const parts = parseDialogue('"Salut"   ');
    expect(parts).toEqual([dialogue("Salut", null)]);
  });
});
