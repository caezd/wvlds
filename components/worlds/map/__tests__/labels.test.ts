import { describe, it, expect } from "vitest";
import { visibleLabels, type LabelCandidate } from "@/components/worlds/map/labels";

// ──────────────────────────────────────────────────────────────────────────
// Les noms des lieux sont affichés en permanence : deux voisins se
// retrouvaient avec leurs étiquettes l'une sur l'autre, illisibles toutes
// les deux. On garde ce qui tient, on tait le reste.
// ──────────────────────────────────────────────────────────────────────────

/** Une carte de 1000 × 1000 pixels à l'échelle 1 : 1 % vaut 10 px. */
const CARTE = { width: 1000, height: 1000 };

function lieu(id: string, x: number, y: number, title = "Le port"): LabelCandidate {
  return { id, x, y, title };
}

describe("visibleLabels", () => {
  it("laisse parler des lieux éloignés", () => {
    const noms = visibleLabels([lieu("a", 10, 10), lieu("b", 60, 60)], CARTE, 1);
    expect([...noms]).toEqual(["a", "b"]);
  });

  it("tait le nom qui recouvrirait celui d'un voisin", () => {
    // 2 % d'écart, soit 20 px : les deux étiquettes se chevauchent.
    const noms = visibleLabels([lieu("a", 10, 10), lieu("b", 12, 10)], CARTE, 1);
    expect([...noms]).toEqual(["a"]);
  });

  it("rend sa place au voisin dès qu'on agrandit", () => {
    // Les lieux s'écartent avec l'échelle ; l'étiquette, elle, garde sa taille.
    const proches = [lieu("a", 10, 10), lieu("b", 12, 10)];
    expect(visibleLabels(proches, CARTE, 1).size).toBe(1);
    expect(visibleLabels(proches, CARTE, 6).size).toBe(2);
  });

  it("garde toujours le nom du lieu ouvert, fût-il le second", () => {
    // C'est celui qu'on regarde : il ne peut pas être celui qu'on tait.
    const noms = visibleLabels([lieu("a", 10, 10), lieu("b", 12, 10)], CARTE, 1, "b");
    expect([...noms]).toEqual(["b"]);
  });

  it("compte avec la longueur du nom", () => {
    // Un nom long occupe plus de largeur, et gêne de plus loin.
    const court = [lieu("a", 10, 10, "Ys"), lieu("b", 14, 10, "Ys")];
    const long = [lieu("a", 10, 10, "La citadelle des vents"), lieu("b", 14, 10, "La citadelle des vents")];
    expect(visibleLabels(court, CARTE, 1).size).toBe(2);
    expect(visibleLabels(long, CARTE, 1).size).toBe(1);
  });

  it("ne dit rien tant que la carte n'est pas mesurée", () => {
    expect(visibleLabels([lieu("a", 10, 10)], { width: 0, height: 0 }, 1).size).toBe(0);
  });
});
