import { describe, it, expect, vi } from "vitest";

import { diffSections, applySectionOps, hasOps, tempId, isTempId } from "@/lib/personaSectionsDiff";
import type { PersonaSectionWithFields } from "@/types/personas";

function section(over: Partial<PersonaSectionWithFields> & { id: string }): PersonaSectionWithFields {
  return { persona_id: "p1", name: over.id, position: 0, fields: [], ...over };
}
function field(id: string, sectionId: string, over: Record<string, unknown> = {}) {
  return { id, section_id: sectionId, type: "text" as const, position: 0, data: { text: "" }, ...over };
}

const CHARGÉ: PersonaSectionWithFields[] = [
  section({ id: "s1", name: "Identité", position: 0, fields: [field("f1", "s1", { data: { text: "Kael" } })] }),
  section({ id: "s2", name: "Histoire", position: 10 }),
];

describe("diffSections", () => {
  it("un arbre inchangé ne donne rien à écrire", () => {
    const ops = diffSections(CHARGÉ, structuredClone(CHARGÉ));
    expect(hasOps(ops)).toBe(false);
  });

  it("une section renommée ou déplacée ne s'écrit que par ce qui a bougé", () => {
    const après = structuredClone(CHARGÉ);
    après[0].name = "Profil";
    après[1].position = 20;
    const ops = diffSections(CHARGÉ, après);
    expect(ops.updateSections).toEqual([
      { id: "s1", patch: { name: "Profil" } },
      { id: "s2", patch: { position: 20 } },
    ]);
    expect(ops.insertSections).toEqual([]);
  });

  it("une section neuve et son champ partent ensemble, la section d'abord", () => {
    const neuve = tempId();
    const champ = tempId();
    const après = [...structuredClone(CHARGÉ), section({ id: neuve, name: "Notes", position: 20, fields: [field(champ, neuve, { data: { text: "hop" } })] })];
    const ops = diffSections(CHARGÉ, après);
    expect(ops.insertSections).toEqual([{ tempId: neuve, name: "Notes", position: 20 }]);
    expect(ops.insertFields).toHaveLength(1);
    expect(ops.insertFields[0].sectionId).toBe(neuve);
    expect(ops.insertFields[0].row).toMatchObject({ type: "text", data: { text: "hop" } });
  });

  it("un champ modifié ne porte que la colonne modifiée", () => {
    const après = structuredClone(CHARGÉ);
    après[0].fields[0].data = { text: "Kaela" };
    const ops = diffSections(CHARGÉ, après);
    expect(ops.updateFields).toEqual([{ id: "f1", patch: { data: { text: "Kaela" } } }]);
  });

  it("une section supprimée emporte ses champs sans les lister", () => {
    const ops = diffSections(CHARGÉ, [CHARGÉ[1]]);
    expect(ops.deleteSections).toEqual(["s1"]);
    expect(ops.deleteFields).toEqual([]);
  });

  it("un champ créé puis supprimé dans la même séance ne s'écrit pas", () => {
    const après = structuredClone(CHARGÉ);
    après[0].fields.push(field(tempId(), "s1"));
    const revenu = structuredClone(CHARGÉ);
    expect(hasOps(diffSections(CHARGÉ, revenu))).toBe(false);
    expect(diffSections(CHARGÉ, après).insertFields).toHaveLength(1);
  });

  it("un champ déplacé d'une section à l'autre n'est pas effacé après coup", () => {
    const après = structuredClone(CHARGÉ);
    const déplacé = après[0].fields.pop()!;
    après[1].fields.push({ ...déplacé, section_id: "s2" });
    const ops = diffSections(CHARGÉ, après);
    // Le champ garde son identifiant : il change de section, il ne renaît pas.
    expect(ops.deleteFields).toEqual([]);
    expect(ops.insertFields).toEqual([]);
    expect(ops.updateFields).toEqual([{ id: "f1", patch: { section_id: "s2" } }]);
  });

  it("un identifiant provisoire se reconnaît", () => {
    expect(isTempId(tempId())).toBe(true);
    expect(isTempId("s1")).toBe(false);
  });
});

describe("applySectionOps", () => {
  /** Un faux client qui note ses appels dans l'ordre. */
  function client(inserts: string[] = []) {
    const appels: string[] = [];
    let n = 0;
    const supabase = {
      from: (table: string) => ({
        insert: (row: unknown) => ({
          select: () => ({
            single: async () => {
              appels.push(`insert ${table} ${JSON.stringify(row)}`);
              return { data: { id: inserts[n++] ?? `new-${n}` }, error: null };
            },
          }),
        }),
        update: (patch: unknown) => ({
          eq: async (_col: string, value: string) => {
            appels.push(`update ${table} ${value} ${JSON.stringify(patch)}`);
            return { error: null };
          },
        }),
        delete: () => ({
          in: async (_col: string, values: string[]) => {
            appels.push(`delete ${table} ${values.join(",")}`);
            return { error: null };
          },
        }),
      }),
    };
    return { supabase, appels };
  }

  it("efface, puis crée les sections, puis leurs champs — qui reçoivent le vrai identifiant", async () => {
    const neuve = tempId();
    const ops = {
      deleteFields: ["f9"],
      deleteSections: ["s9"],
      insertSections: [{ tempId: neuve, name: "Notes", position: 20 }],
      updateSections: [{ id: "s1", patch: { name: "Profil" } }],
      insertFields: [{ tempId: tempId(), sectionId: neuve, row: { type: "text", data: { text: "hop" }, position: 0 } }],
      updateFields: [{ id: "f1", patch: { data: { text: "Kaela" } } }],
    };
    const { supabase, appels } = client(["s-neuve"]);

    const res = await applySectionOps(supabase, "p1", ops);

    expect(res.error).toBeNull();
    expect(appels[0]).toBe("delete persona_section_fields f9");
    expect(appels[1]).toBe("delete persona_sections s9");
    expect(appels[2]).toContain('insert persona_sections {"persona_id":"p1","name":"Notes"');
    expect(appels[3]).toContain("update persona_sections s1");
    // Le champ se rattache à la section qui vient de naître.
    expect(appels[4]).toContain('"section_id":"s-neuve"');
    expect(appels[5]).toContain("update persona_section_fields f1");
  });

  it("la première erreur arrête tout", async () => {
    const supabase = {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "refusé" } }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
        delete: () => ({ in: async () => ({ error: null }) }),
      }),
    };
    const suite = vi.fn();
    const res = await applySectionOps(supabase, "p1", {
      deleteFields: [], deleteSections: [],
      insertSections: [{ tempId: tempId(), name: "Notes", position: 0 }],
      updateSections: [], insertFields: [], updateFields: [],
    });
    expect(res.error).toBe("refusé");
    expect(suite).not.toHaveBeenCalled();
  });
});
