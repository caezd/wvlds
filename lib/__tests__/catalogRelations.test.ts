import { describe, it, expect } from "vitest";

import {
  missingPrerequisites,
  recipeLeafTotals,
  recipeTree,
  relationsFrom,
  relationsTo,
  type CatalogRelation,
} from "@/lib/catalogRelations";

const R: CatalogRelation[] = [
  // Compétences : Maître forgeron ← Forge avancée ← Forge ; Maître forgeron ← Métallurgie
  { from_id: "avancee", to_id: "forge", kind: "prerequisite", quantity: 1, sort_index: 0 },
  { from_id: "maitre", to_id: "avancee", kind: "prerequisite", quantity: 1, sort_index: 1 },
  { from_id: "maitre", to_id: "metallurgie", kind: "prerequisite", quantity: 1, sort_index: 0 },
  // Objets : Épée = 2 lingots + 1 cuir ; Lingot = 3 minerais
  { from_id: "epee", to_id: "lingot", kind: "ingredient", quantity: 2, sort_index: 0 },
  { from_id: "epee", to_id: "cuir", kind: "ingredient", quantity: 1, sort_index: 1 },
  { from_id: "lingot", to_id: "minerai", kind: "ingredient", quantity: 3 },
];

describe("relationsFrom / relationsTo", () => {
  it("lit les arêtes d'un genre dans l'ordre d'affichage, dans les deux sens", () => {
    expect(relationsFrom("maitre", R, "prerequisite").map((r) => r.to_id)).toEqual(["metallurgie", "avancee"]);
    expect(relationsTo("forge", R, "prerequisite").map((r) => r.from_id)).toEqual(["avancee"]);
    expect(relationsTo("lingot", R, "ingredient").map((r) => r.from_id)).toEqual(["epee"]);
    expect(relationsFrom("forge", R, "ingredient")).toEqual([]);
  });
});

describe("missingPrerequisites", () => {
  it("ne regarde que les prérequis directs", () => {
    expect(missingPrerequisites("maitre", new Set(), R)).toEqual(["metallurgie", "avancee"]);
    expect(missingPrerequisites("maitre", new Set(["avancee"]), R)).toEqual(["metallurgie"]);
    // « Forge avancée » acquise vaut « Forge » acquise : rien à redire.
    expect(missingPrerequisites("maitre", new Set(["avancee", "metallurgie"]), R)).toEqual([]);
    expect(missingPrerequisites("forge", new Set(), R)).toEqual([]);
  });
});

describe("recipeTree", () => {
  it("déplie la composition, récursivement, avec les quantités", () => {
    const tree = recipeTree("epee", R);
    expect(tree).toEqual({
      id: "epee", quantity: 1, children: [
        { id: "lingot", quantity: 2, children: [{ id: "minerai", quantity: 3, children: [] }] },
        { id: "cuir", quantity: 1, children: [] },
      ],
    });
    expect(recipeTree("cuir", R)).toEqual({ id: "cuir", quantity: 1, children: [] });
  });

  it("s'arrête à la profondeur donnée et devant une boucle", () => {
    const shallow = recipeTree("epee", R, 1);
    expect(shallow.children[0]).toMatchObject({ id: "lingot", truncated: true, children: [] });
    const loop: CatalogRelation[] = [
      { from_id: "a", to_id: "b", kind: "ingredient", quantity: 1 },
      { from_id: "b", to_id: "a", kind: "ingredient", quantity: 1 },
    ];
    const tree = recipeTree("a", loop);
    expect(tree.children[0].id).toBe("b");
    expect(tree.children[0].children[0]).toMatchObject({ id: "a", truncated: true });
  });

  it("totalise les matières premières pour un exemplaire", () => {
    const totals = recipeLeafTotals(recipeTree("epee", R));
    expect(Object.fromEntries(totals)).toEqual({ minerai: 6, cuir: 1 });
  });
});
