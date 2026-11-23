import { describe, it, expect } from "vitest";
import {
  groupChoices,
  groupLineages,
  groupPathLabel,
  groupSubtreeIds,
  isInGroup,
  normalizeGroupRow,
  personaTints,
  resolvePersonaGroups,
  type PersonaGroupRow,
} from "@/lib/personaGroups";

const row = (over: Partial<PersonaGroupRow> & { id: string }): PersonaGroupRow => ({
  name: over.id,
  color: null,
  parent_id: null,
  sort_index: 0,
  apply_color: true,
  ...over,
});

// Maison (rouge)
//   ├─ Branche cadette (hérite)
//   │    └─ Gardes (bleu, n'applique pas)
//   └─ Branche aînée (vert)
// Ordre (sans couleur, n'applique pas)
const ROWS: PersonaGroupRow[] = [
  row({ id: "ordre", name: "Ordre", sort_index: 1, apply_color: false }),
  row({ id: "gardes", name: "Gardes", color: "#0000ff", parent_id: "cadette", apply_color: false }),
  row({ id: "ainee", name: "Branche aînée", color: "#00ff00", parent_id: "maison", sort_index: 0 }),
  row({ id: "cadette", name: "Branche cadette", parent_id: "maison", sort_index: 1 }),
  row({ id: "maison", name: "Maison", color: "#ff0000", sort_index: 0 }),
];

describe("resolvePersonaGroups", () => {
  it("aplatit l'arbre en ordre de lecture, avec profondeur et chemin", () => {
    const groups = resolvePersonaGroups(ROWS);
    expect(groups.map((g) => [g.id, g.depth])).toEqual([
      ["maison", 0], ["ainee", 1], ["cadette", 1], ["gardes", 2], ["ordre", 0],
    ]);
    expect(groupPathLabel(groups[3])).toBe("Maison › Branche cadette › Gardes");
  });

  it("sans couleur propre, un groupe prend celle de son plus proche ancêtre", () => {
    const byId = new Map(resolvePersonaGroups(ROWS).map((g) => [g.id, g]));
    expect(byId.get("cadette")!.swatch).toBe("#ff0000");
    expect(byId.get("ainee")!.swatch).toBe("#00ff00");
    expect(byId.get("ordre")!.swatch).toBeNull();
  });

  it("la teinte n'existe que si le groupe applique sa couleur", () => {
    const byId = new Map(resolvePersonaGroups(ROWS).map((g) => [g.id, g]));
    expect(byId.get("cadette")!.tint).toBe("#ff0000");
    expect(byId.get("gardes")!.tint).toBeUndefined();
    expect(byId.get("ordre")!.tint).toBeUndefined();
  });

  it("un parent absent ou une boucle : le groupe se range à la racine plutôt que de disparaître", () => {
    const groups = resolvePersonaGroups([
      row({ id: "orphelin", parent_id: "supprime" }),
      row({ id: "a", parent_id: "b" }),
      row({ id: "b", parent_id: "a" }),
    ]);
    expect(groups.map((g) => g.id).sort()).toEqual(["a", "b", "orphelin"]);
    expect(groups.find((g) => g.id === "orphelin")!.depth).toBe(0);
  });
});

describe("appartenance héritée", () => {
  it("un persona d'un sous-groupe compte dans tous ses ancêtres, pas dans ses frères", () => {
    const lineages = groupLineages(ROWS);
    expect(isInGroup(lineages, "gardes", "gardes")).toBe(true);
    expect(isInGroup(lineages, "gardes", "cadette")).toBe(true);
    expect(isInGroup(lineages, "gardes", "maison")).toBe(true);
    expect(isInGroup(lineages, "gardes", "ainee")).toBe(false);
    expect(isInGroup(lineages, "maison", "gardes")).toBe(false);
    expect(isInGroup(lineages, undefined, "maison")).toBe(false);
  });

  it("une boucle ne fait pas tourner le calcul sans fin", () => {
    const lineages = groupLineages([row({ id: "a", parent_id: "b" }), row({ id: "b", parent_id: "a" })]);
    expect([...lineages.get("a")!].sort()).toEqual(["a", "b"]);
  });

  it("le sous-arbre d'un groupe : lui et toute sa descendance", () => {
    expect([...groupSubtreeIds(ROWS, "maison")].sort()).toEqual(["ainee", "cadette", "gardes", "maison"]);
    expect([...groupSubtreeIds(ROWS, "gardes")]).toEqual(["gardes"]);
  });
});

describe("personaTints et groupChoices", () => {
  it("la teinte par persona, sans ceux dont le groupe ne l'applique pas", () => {
    const tints = personaTints(resolvePersonaGroups(ROWS), [
      { persona_id: "p1", group_id: "cadette" },
      { persona_id: "p2", group_id: "gardes" },
      { persona_id: "p3", group_id: "ainee" },
    ]);
    expect(tints).toEqual({ p1: "#ff0000", p3: "#00ff00" });
  });

  it("les choix d'une liste : chemin et pastille, même quand la couleur n'est pas appliquée", () => {
    const choices = groupChoices(resolvePersonaGroups(ROWS));
    expect(choices[3]).toEqual({ id: "gardes", name: "Maison › Branche cadette › Gardes", color: "#0000ff" });
  });
});

describe("normalizeGroupRow", () => {
  it("une ligne d'avant la migration 232 : racine, couleur appliquée", () => {
    expect(normalizeGroupRow({ id: "g", name: "G", color: "#123456" })).toEqual({
      id: "g", name: "G", color: "#123456", parent_id: null, sort_index: 0, apply_color: true,
    });
  });
});
