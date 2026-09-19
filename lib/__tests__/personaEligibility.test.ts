import { describe, it, expect } from "vitest";
import { getUsablePersonaIds, isPersonaUsable, personaLockReason } from "@/lib/personaEligibility";

function persona(id: string, createdAt: string, isTemplate = false) {
  return { id, created_at: createdAt, is_template: isTemplate };
}

// 7 personas créés dans l'ordre p1..p7 (p1 = plus ancien).
const sevenPersonas = [
  persona("p1", "2026-01-01T00:00:00Z"),
  persona("p2", "2026-01-02T00:00:00Z"),
  persona("p3", "2026-01-03T00:00:00Z"),
  persona("p4", "2026-01-04T00:00:00Z"),
  persona("p5", "2026-01-05T00:00:00Z"),
  persona("p6", "2026-01-06T00:00:00Z"),
  persona("p7", "2026-01-07T00:00:00Z"),
];

describe("getUsablePersonaIds", () => {
  it("plan gratuit : seuls les 5 premiers (created_at) sont utilisables", () => {
    const usable = getUsablePersonaIds(sevenPersonas, "free");
    expect(usable).toEqual(new Set(["p1", "p2", "p3", "p4", "p5"]));
  });

  it("plan gratuit : reste correct même si la liste n'est pas déjà triée", () => {
    const shuffled = [sevenPersonas[3], sevenPersonas[0], sevenPersonas[6], sevenPersonas[1], sevenPersonas[5], sevenPersonas[2], sevenPersonas[4]];
    const usable = getUsablePersonaIds(shuffled, "free");
    expect(usable).toEqual(new Set(["p1", "p2", "p3", "p4", "p5"]));
  });

  it("plan gratuit implicite (null/undefined) : même règle que 'free'", () => {
    expect(getUsablePersonaIds(sevenPersonas, null)).toEqual(new Set(["p1", "p2", "p3", "p4", "p5"]));
    expect(getUsablePersonaIds(sevenPersonas, undefined)).toEqual(new Set(["p1", "p2", "p3", "p4", "p5"]));
  });

  it("abonné : tous les personas sont utilisables, y compris au-delà du rang 5", () => {
    const usable = getUsablePersonaIds(sevenPersonas, "subscribed");
    expect(usable).toEqual(new Set(sevenPersonas.map((p) => p.id)));
  });

  it("lifetime : tous les personas sont utilisables", () => {
    const usable = getUsablePersonaIds(sevenPersonas, "lifetime");
    expect(usable).toEqual(new Set(sevenPersonas.map((p) => p.id)));
  });

  it("moins de 5 personas : tous utilisables même en plan gratuit", () => {
    const usable = getUsablePersonaIds(sevenPersonas.slice(0, 3), "free");
    expect(usable).toEqual(new Set(["p1", "p2", "p3"]));
  });

  it("exclut les personas-modèles (is_template) du calcul et du résultat", () => {
    const withTemplate = [...sevenPersonas.slice(0, 4), persona("tpl", "2025-01-01T00:00:00Z", true)];
    const usable = getUsablePersonaIds(withTemplate, "free");
    expect(usable.has("tpl")).toBe(false);
    expect(usable).toEqual(new Set(["p1", "p2", "p3", "p4"]));
  });

  it("horodatages identiques : départage déterministe par id (comme id ASC en base)", () => {
    const tied = [
      persona("b", "2026-01-01T00:00:00Z"),
      persona("a", "2026-01-01T00:00:00Z"),
    ];
    const usable = getUsablePersonaIds(tied, "free");
    expect(usable).toEqual(new Set(["a", "b"])); // les deux tiennent dans la limite de 5
  });

  it("created_at absent/invalide : traité comme le plus récent, jamais NaN dans le tri", () => {
    const withInvalid = [
      ...sevenPersonas.slice(0, 5), // p1..p5, valides
      persona("bad", ""), // date invalide
    ];
    const usable = getUsablePersonaIds(withInvalid, "free");
    // p1..p5 sont déjà 5 personas valides plus anciens que "bad" -> "bad" est exclu.
    expect(usable.has("bad")).toBe(false);
    expect(usable).toEqual(new Set(["p1", "p2", "p3", "p4", "p5"]));
  });
});

describe("isPersonaUsable", () => {
  it("true pour un persona dans les 5 premiers, false au-delà", () => {
    expect(isPersonaUsable("p5", sevenPersonas, "free")).toBe(true);
    expect(isPersonaUsable("p6", sevenPersonas, "free")).toBe(false);
  });

  it("toujours true pour un compte abonné", () => {
    expect(isPersonaUsable("p7", sevenPersonas, "subscribed")).toBe(true);
  });
});

describe("validation de la fiche (migration 181)", () => {
  it("une fiche non validée ou incomplète ne joue pas, même abonné", () => {
    const list = [
      { ...persona("ok", "2026-01-01T00:00:00Z"), review_status: "approved", sheet_complete: true },
      { ...persona("draft", "2026-01-02T00:00:00Z"), review_status: "draft", sheet_complete: true },
      { ...persona("holes", "2026-01-03T00:00:00Z"), review_status: "approved", sheet_complete: false },
    ];
    expect(getUsablePersonaIds(list, "subscribed")).toEqual(new Set(["ok"]));
    expect(getUsablePersonaIds(list, "free")).toEqual(new Set(["ok"]));
  });

  it("un brouillon compte dans le quota des 5 plus anciens", () => {
    const list = [
      ...sevenPersonas.slice(0, 4).map((p) => ({ ...p, review_status: "approved", sheet_complete: true })),
      { ...persona("p5", "2026-01-05T00:00:00Z"), review_status: "draft", sheet_complete: true },
      { ...persona("p6", "2026-01-06T00:00:00Z"), review_status: "approved", sheet_complete: true },
    ];
    // p5 tient la cinquième place sans jouer ; p6 reste au-delà du quota.
    expect(getUsablePersonaIds(list, "free")).toEqual(new Set(["p1", "p2", "p3", "p4"]));
  });

  it("un PNJ (migration 182) joue hors quota, mais reste soumis à sa fiche", () => {
    const list = [
      ...sevenPersonas.slice(0, 5).map((p) => ({ ...p, review_status: "approved", sheet_complete: true })),
      { ...persona("npc", "2026-02-01T00:00:00Z"), is_npc: true, review_status: "approved", sheet_complete: true },
      { ...persona("npc-holes", "2026-02-02T00:00:00Z"), is_npc: true, review_status: "approved", sheet_complete: false },
    ];
    const usable = getUsablePersonaIds(list, "free");
    // Les cinq personnels tiennent dans le quota malgré les deux PNJ plus anciens que p3…p5.
    expect(usable).toEqual(new Set(["p1", "p2", "p3", "p4", "p5", "npc"]));
    expect(personaLockReason(list[6], usable)).toBe("incomplete");
  });

  it("personaLockReason nomme la fiche avant le quota", () => {
    const usable = new Set(["p1"]);
    expect(personaLockReason({ ...persona("p1", ""), review_status: "approved" }, usable)).toBeNull();
    expect(personaLockReason({ ...persona("x", ""), review_status: "draft" }, usable)).toBe("unreviewed");
    expect(personaLockReason({ ...persona("x", ""), review_status: "approved", sheet_complete: false }, usable)).toBe("incomplete");
    expect(personaLockReason({ ...persona("x", ""), review_status: "approved", sheet_complete: true }, usable)).toBe("quota");
    // Sans colonnes (anciens appelants) : seule la place dans le quota compte.
    expect(personaLockReason(persona("x", ""), usable)).toBe("quota");
  });
});
