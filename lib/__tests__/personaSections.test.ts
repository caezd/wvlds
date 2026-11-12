import { describe, it, expect, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import { fetchSectionsByPersona, normalizeEmbeddedSections } from "@/lib/personaSections";

describe("normalizeEmbeddedSections", () => {
  it("renomme les champs joints en `fields` et trie sections et champs par position", () => {
    const out = normalizeEmbeddedSections([
      { id: "s2", persona_id: "p", name: "B", position: 1, persona_section_fields: [] },
      {
        id: "s1", persona_id: "p", name: "A", position: 0,
        persona_section_fields: [
          { id: "f2", section_id: "s1", position: 1 },
          { id: "f1", section_id: "s1", position: 0 },
        ],
      },
    ]);
    expect(out.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(out[0].fields.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(out[0]).not.toHaveProperty("persona_section_fields");
  });

  it("accepte null et des champs absents", () => {
    expect(normalizeEmbeddedSections(null)).toEqual([]);
    expect(normalizeEmbeddedSections([{ id: "s", persona_id: "p", name: "", position: 0 }])[0].fields).toEqual([]);
  });
});

describe("fetchSectionsByPersona", () => {
  it("charge sections et champs en une seule requête", async () => {
    const mock = createSupabaseMock({
      results: [{ data: [{ id: "s1", persona_id: "p1", name: "A", position: 0, persona_section_fields: [{ id: "f1", section_id: "s1", position: 0 }] }] }],
    });
    const map = await fetchSectionsByPersona(mock.client as never, ["p1", "p2"]);
    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(mock.builders[0].builder.select.mock.calls[0][0]).toContain("persona_section_fields(");
    expect(map.get("p1")?.[0].fields.map((f) => f.id)).toEqual(["f1"]);
    expect(map.get("p2")).toEqual([]);
  });

  it("retombe sur deux requêtes si la jointure est refusée", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const mock = createSupabaseMock({
      results: [
        { data: null, error: { message: "relation introuvable" } },
        { data: [{ id: "s1", persona_id: "p1", name: "A", position: 0 }] },
        { data: [{ id: "f1", section_id: "s1", position: 0 }] },
      ],
    });
    const map = await fetchSectionsByPersona(mock.client as never, ["p1"]);
    expect(mock.builders.map((b) => b.table)).toEqual(["persona_sections", "persona_sections", "persona_section_fields"]);
    expect(map.get("p1")?.[0].fields.map((f) => f.id)).toEqual(["f1"]);
    erreur.mockRestore();
  });
});
