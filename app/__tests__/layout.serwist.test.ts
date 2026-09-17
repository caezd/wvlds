import { describe, it, expect } from "vitest";
import { readTracked } from "@/test/sourceFiles";

// Régression : la page se rechargeait toute seule en plein remplissage d'un
// formulaire (image de catégorie envoyée, puis perdue). `reloadOnOnline` vaut
// TRUE par défaut chez Serwist, et recharge à chaque événement « online » du
// navigateur, que Firefox émet au moindre changement d'interface réseau.
// Retirer la prop ne suffit donc pas : elle doit être posée à false.
describe("app/layout.tsx — service worker", () => {
  it("désactive explicitement le rechargement automatique au retour en ligne", () => {
    const source = readTracked("app/layout.tsx");
    expect(source).not.toBeNull();
    expect(source).toMatch(/reloadOnOnline=\{false\}/);
  });
});
