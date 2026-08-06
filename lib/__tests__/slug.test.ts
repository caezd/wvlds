import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("met en minuscules et remplace les espaces par des tirets", () => {
    expect(slugify("La Forêt Noire")).toBe("la-foret-noire");
  });

  it("retire les diacritiques", () => {
    expect(slugify("Éléphant à crête")).toBe("elephant-a-crete");
  });

  it("retire la ponctuation", () => {
    expect(slugify("Qu'est-ce que c'est ?")).toBe("qu-est-ce-que-c-est");
  });

  it("retombe sur 'page' pour une entrée vide ou sans caractère alphanumérique", () => {
    expect(slugify("")).toBe("page");
    expect(slugify("!!!")).toBe("page");
  });

  it("tronque à 64 caractères", () => {
    const long = "a".repeat(100);
    expect(slugify(long)).toHaveLength(64);
  });
});
