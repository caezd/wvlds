import { describe, it, expect } from "vitest";
import {
  groupChoices,
  groupLineages,
  groupPathLabel,
  groupSubtreeIds,
  indexAssignments,
  isInGroup,
  normalizeGroupRow,
  personaTints,
  resolvePersonaGroups,
  type PersonaGroupRow,
} from "@/lib/personaGroups";

const row = (over: Partial<PersonaGroupRow> & { id: string }): PersonaGroupRow => ({
  name: over.id,
  description: null,
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
    expect(isInGroup(lineages, ["gardes"], "gardes")).toBe(true);
    expect(isInGroup(lineages, ["gardes"], "cadette")).toBe(true);
    expect(isInGroup(lineages, ["gardes"], "maison")).toBe(true);
    expect(isInGroup(lineages, ["gardes"], "ainee")).toBe(false);
    expect(isInGroup(lineages, ["maison"], "gardes")).toBe(false);
    expect(isInGroup(lineages, undefined, "maison")).toBe(false);
  });

  it("un persona de plusieurs groupes compte dans chacun et dans leurs ancêtres", () => {
    const lineages = groupLineages(ROWS);
    expect(isInGroup(lineages, ["ordre", "gardes"], "ordre")).toBe(true);
    expect(isInGroup(lineages, ["ordre", "gardes"], "maison")).toBe(true);
    expect(isInGroup(lineages, ["ordre", "gardes"], "ainee")).toBe(false);
    expect(isInGroup(lineages, [], "ordre")).toBe(false);
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

describe("indexAssignments", () => {
  it("tous les groupes d'un persona, son groupe principal en tête", () => {
    const { groupsByPersona, primaryByPersona } = indexAssignments([
      { persona_id: "p1", group_id: "ordre", is_primary: false },
      { persona_id: "p1", group_id: "ainee", is_primary: true },
      { persona_id: "p2", group_id: "gardes", is_primary: true },
    ]);
    expect(groupsByPersona.get("p1")).toEqual(["ainee", "ordre"]);
    expect(primaryByPersona.get("p1")).toBe("ainee");
    expect(groupsByPersona.get("p2")).toEqual(["gardes"]);
    expect(primaryByPersona.has("p3")).toBe(false);
  });

  it("sans groupe marqué principal (ligne d'avant la migration 242), le premier lu en tient lieu", () => {
    const { primaryByPersona } = indexAssignments([
      { persona_id: "p1", group_id: "ordre" },
      { persona_id: "p1", group_id: "ainee", is_primary: false },
    ]);
    expect(primaryByPersona.get("p1")).toBe("ordre");
  });
});

describe("personaTints et groupChoices", () => {
  it("la teinte par persona, sans ceux dont le groupe ne l'applique pas", () => {
    const tints = personaTints(resolvePersonaGroups(ROWS), [
      { persona_id: "p1", group_id: "cadette", is_primary: true },
      { persona_id: "p2", group_id: "gardes", is_primary: true },
      { persona_id: "p3", group_id: "ainee", is_primary: true },
    ]);
    expect(tints).toEqual({ p1: "#ff0000", p3: "#00ff00" });
  });

  it("seul le groupe principal teinte, même si un autre groupe applique sa couleur", () => {
    const tints = personaTints(resolvePersonaGroups(ROWS), [
      { persona_id: "p1", group_id: "ainee", is_primary: false },
      { persona_id: "p1", group_id: "ordre", is_primary: true },
      { persona_id: "p2", group_id: "ainee", is_primary: false },
      { persona_id: "p2", group_id: "cadette", is_primary: true },
    ]);
    expect(tints).toEqual({ p2: "#ff0000" });
  });

  it("les choix d'une liste : chemin et pastille, même quand la couleur n'est pas appliquée", () => {
    const choices = groupChoices(resolvePersonaGroups(ROWS));
    expect(choices[3]).toEqual({ id: "gardes", name: "Maison › Branche cadette › Gardes", color: "#0000ff" });
  });
});

describe("normalizeGroupRow", () => {
  it("une ligne d'avant la migration 232 : racine, couleur appliquée", () => {
    expect(normalizeGroupRow({ id: "g", name: "G", color: "#123456" })).toEqual({
      id: "g", name: "G", description: null, color: "#123456", parent_id: null, sort_index: 0, apply_color: true,
    });
  });
});
