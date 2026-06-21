import { describe, it, expect } from "vitest";
import { parseDialogue, type DialoguePart } from "@/lib/dialogue-bubbles";

const dialogue = (speech: string): DialoguePart => ({ kind: "dialogue", speech });
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

  it("extrait un dialogue entre guillemets droits si le paragraphe commence par un guillemet", () => {
    expect(parseDialogue('"Bonjour"')).toEqual([dialogue("Bonjour")]);
  });

  it("extrait un dialogue avec guillemets français « »", () => {
    expect(parseDialogue("« Bonjour »")).toEqual([dialogue("Bonjour")]);
  });

  it("extrait un dialogue avec guillemets courbes “”", () => {
    expect(parseDialogue("“Bonjour”")).toEqual([dialogue("Bonjour")]);
  });

  it("met le texte après le guillemet fermant comme prose séparée", () => {
    expect(parseDialogue('"Bonjour", dit-il.')).toEqual([
      dialogue("Bonjour"),
      prose(", dit-il."),
    ]);
  });

  it("traite comme prose si le paragraphe ne commence pas par un guillemet", () => {
    expect(parseDialogue('Il sourit. "Salut"')).toEqual([
      prose('Il sourit. "Salut"'),
    ]);
  });

  it("traite un guillemet ouvert mais jamais fermé comme de la prose", () => {
    expect(parseDialogue('"Bonjour sans fin')).toEqual([
      prose('"Bonjour sans fin'),
    ]);
  });

  it("sépare les paragraphes (double saut de ligne)", () => {
    expect(parseDialogue('"Un"\n\n"Deux"')).toEqual([
      dialogue("Un"),
      dialogue("Deux"),
    ]);
  });

  it("un paragraphe prose suivi d'un paragraphe dialogue", () => {
    expect(parseDialogue("Il hésite.\n\n« Allons-y. »")).toEqual([
      prose("Il hésite."),
      dialogue("Allons-y."),
    ]);
  });

  it("dialogue suivi d'un paragraphe prose via double saut de ligne", () => {
    expect(parseDialogue('"Salut"\n\nIl s\'en alla.')).toEqual([
      dialogue("Salut"),
      prose("Il s'en alla."),
    ]);
  });
});
