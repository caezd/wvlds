import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/app/actions/personaRelations", () => ({
  acceptPersonaRelation: vi.fn(),
  createPersonaRelation: vi.fn(),
  deletePersonaRelation: vi.fn(),
  updatePersonaRelation: vi.fn(),
}));

import { toCanvasGroups } from "../useRelationsData";

describe("toCanvasGroups", () => {
  it("l'ordre de l'arbre, le chemin pour nom, la pastille héritée et la teinte seulement si le groupe l'applique", () => {
    const groups = toCanvasGroups([
      { id: "ordre", name: "Ordre", color: "#0000ff", parent_id: null, sort_index: 1, apply_color: false },
      { id: "cadette", name: "Cadette", color: null, parent_id: "maison", sort_index: 0, apply_color: true },
      { id: "maison", name: "Maison", color: "#ff0000", parent_id: null, sort_index: 0, apply_color: true },
    ]);
    expect(groups).toEqual([
      { id: "maison", name: "Maison", color: "#ff0000", sort_index: 0, parent_id: null, tint: "#ff0000" },
      { id: "cadette", name: "Maison › Cadette", color: "#ff0000", sort_index: 1, parent_id: "maison", tint: "#ff0000" },
      { id: "ordre", name: "Ordre", color: "#0000ff", sort_index: 2, parent_id: null, tint: undefined },
    ]);
  });
});
