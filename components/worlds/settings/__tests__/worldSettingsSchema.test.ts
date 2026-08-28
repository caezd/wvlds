import { describe, it, expect } from "vitest";

import { worldSettingsSchema, truthyOrNull } from "../worldSettingsSchema";

// ──────────────────────────────────────────────────────────────────────────
// Le schéma du formulaire des réglages d'un monde vivait au milieu d'un
// composant de 1 448 lignes, et n'était vérifié qu'en montant l'interface.
// Isolé, il se teste directement.
//
// Ce qui compte ici : ce sont ces règles qui décident si l'utilisateur peut
// enregistrer. Trop lâches, la base reçoit n'importe quoi ; trop strictes, un
// champ légitime devient impossible à valider sans que rien n'explique pourquoi.
// ──────────────────────────────────────────────────────────────────────────

const valide = {
  name: "Ténèbres",
  description: "",
  icon_url: "",
  banner_url: "",
  color: "",
  visibility: "private" as const,
  wiki_label: "",
};

describe("worldSettingsSchema", () => {
  it("accepte un monde minimal", () => {
    expect(worldSettingsSchema.safeParse(valide).success).toBe(true);
  });

  it("exige au moins deux caractères pour le nom", () => {
    expect(worldSettingsSchema.safeParse({ ...valide, name: "A" }).success).toBe(false);
    expect(worldSettingsSchema.safeParse({ ...valide, name: "Ab" }).success).toBe(true);
  });

  it("plafonne la description à 1000 caractères", () => {
    expect(worldSettingsSchema.safeParse({ ...valide, description: "x".repeat(1000) }).success).toBe(true);
    expect(worldSettingsSchema.safeParse({ ...valide, description: "x".repeat(1001) }).success).toBe(false);
  });

  it("plafonne le libellé du wiki à 40 caractères", () => {
    expect(worldSettingsSchema.safeParse({ ...valide, wiki_label: "x".repeat(40) }).success).toBe(true);
    expect(worldSettingsSchema.safeParse({ ...valide, wiki_label: "x".repeat(41) }).success).toBe(false);
  });

  it("n'accepte qu'une couleur hexadécimale, à 3 ou 6 chiffres", () => {
    for (const bonne of ["#1f2937", "#abc", "#ABCDEF"]) {
      expect(worldSettingsSchema.safeParse({ ...valide, color: bonne }).success, bonne).toBe(true);
    }
    for (const mauvaise of ["1f2937", "#12345", "rouge", "#xyzxyz", "#1f29377"]) {
      expect(worldSettingsSchema.safeParse({ ...valide, color: mauvaise }).success, mauvaise).toBe(false);
    }
  });

  it("laisse les champs facultatifs vides", () => {
    // Un champ jamais rempli arrive en `""`, pas en `undefined` : sans le
    // `.or(z.literal(""))`, le formulaire serait invalide dès l'ouverture.
    const r = worldSettingsSchema.safeParse({ ...valide, color: "", icon_url: "", banner_url: "" });
    expect(r.success).toBe(true);
  });

  it("refuse une adresse d'image qui n'en est pas une", () => {
    expect(worldSettingsSchema.safeParse({ ...valide, icon_url: "pas-une-url" }).success).toBe(false);
    expect(worldSettingsSchema.safeParse({ ...valide, icon_url: "https://x.test/a.png" }).success).toBe(true);
  });

  it("n'admet que deux visibilités", () => {
    expect(worldSettingsSchema.safeParse({ ...valide, visibility: "public" }).success).toBe(true);
    expect(worldSettingsSchema.safeParse({ ...valide, visibility: "secret" }).success).toBe(false);
  });
});

describe("truthyOrNull", () => {
  it("rend null pour ce qui est vide ou blanc", () => {
    // Sans cela, la base se remplit de chaînes vides là où l'absence de valeur
    // devrait s'écrire `null` — et « aucune couleur » cesse d'être distinguable
    // de « couleur effacée ».
    expect(truthyOrNull("")).toBeNull();
    expect(truthyOrNull("   ")).toBeNull();
    expect(truthyOrNull(null)).toBeNull();
    expect(truthyOrNull(undefined)).toBeNull();
  });

  it("élague ce qu'il garde", () => {
    expect(truthyOrNull("  #fff  ")).toBe("#fff");
    expect(truthyOrNull("Ténèbres")).toBe("Ténèbres");
  });
});
