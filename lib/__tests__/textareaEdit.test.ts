import { describe, it, expect, vi, afterEach } from "vitest";
import { ecrireAvecAnnulation } from "@/lib/textareaEdit";
import { differenceMinimale } from "@/lib/markdownFormatting";

type AvecExecCommand = { execCommand?: unknown };

afterEach(() => {
  delete (document as AvecExecCommand).execCommand;
});

/** Un champ posé dans le document, seul état où le focus a un sens. */
function champ(valeur: string, start: number, end: number): HTMLTextAreaElement {
  const el = document.createElement("textarea");
  el.value = valeur;
  document.body.append(el);
  el.setSelectionRange(start, end);
  return el;
}

describe("differenceMinimale", () => {
  it("ne retient que le passage qui change", () => {
    // Le préfixe « Un » et le suffixe « ici » restent en place : l'entrée
    // d'annulation ne portera que sur le mot mis en gras.
    expect(differenceMinimale("Un mot ici", "Un **mot** ici")).toEqual({
      debut: 3,
      fin: 6,
      texte: "**mot**",
    });
  });

  it("décrit une insertion pure comme une plage vide", () => {
    expect(differenceMinimale("fin ", "fin ****")).toEqual({
      debut: 4,
      fin: 4,
      texte: "****",
    });
  });

  it("décrit une suppression pure comme un texte vide", () => {
    expect(differenceMinimale("- a", "a")).toEqual({ debut: 0, fin: 2, texte: "" });
  });

  it("rend une différence vide quand rien ne change", () => {
    expect(differenceMinimale("abc", "abc")).toEqual({ debut: 3, fin: 3, texte: "" });
  });
});

describe("ecrireAvecAnnulation", () => {
  it("renonce quand le navigateur n'offre pas l'API", () => {
    // jsdom est dans ce cas : l'appelant doit pouvoir retomber sur l'état.
    expect(ecrireAvecAnnulation(champ("abc", 0, 0), "abd")).toBe(false);
  });

  it("ne remplace que le passage modifié", () => {
    const execCommand = vi.fn().mockReturnValue(true);
    (document as AvecExecCommand).execCommand = execCommand;
    const el = champ("Un mot ici", 3, 6);

    expect(ecrireAvecAnnulation(el, "Un **mot** ici")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("insertText", false, "**mot**");
    // La sélection posée avant l'appel est la plage que la commande remplace.
    expect([el.selectionStart, el.selectionEnd]).toEqual([3, 6]);
  });

  it("supprime au lieu d'insérer du vide", () => {
    // `insertText` avec une chaîne vide ne supprime pas partout.
    const execCommand = vi.fn().mockReturnValue(true);
    (document as AvecExecCommand).execCommand = execCommand;

    ecrireAvecAnnulation(champ("- a", 0, 0), "a");

    expect(execCommand).toHaveBeenCalledWith("delete");
  });

  it("donne le focus au champ, qu'un menu a pu lui prendre", () => {
    (document as AvecExecCommand).execCommand = vi.fn().mockReturnValue(true);
    const el = champ("abc", 0, 3);
    const ailleurs = document.createElement("button");
    document.body.append(ailleurs);
    ailleurs.focus();

    ecrireAvecAnnulation(el, "**abc**");

    expect(document.activeElement).toBe(el);
  });

  it("n'écrit rien quand la valeur ne change pas", () => {
    const execCommand = vi.fn().mockReturnValue(true);
    (document as AvecExecCommand).execCommand = execCommand;

    expect(ecrireAvecAnnulation(champ("abc", 0, 0), "abc")).toBe(true);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("retombe sur l'état quand la commande échoue", () => {
    (document as AvecExecCommand).execCommand = vi.fn().mockReturnValue(false);

    expect(ecrireAvecAnnulation(champ("abc", 0, 0), "abd")).toBe(false);
  });
});
