import { describe, it, expect } from "vitest";
import {
  isPronounOption,
  sanitizePronouns,
  PRONOUNS_MAX_COUNT,
  PRONOUN_CUSTOM_MAX_LENGTH,
} from "@/lib/pronouns";

describe("isPronounOption", () => {
  it("reconnaît les clés prédéfinies", () => {
    expect(isPronounOption("he_him")).toBe(true);
    expect(isPronounOption("they_them")).toBe(true);
  });

  it("rejette une valeur libre", () => {
    expect(isPronounOption("She/Her/elle")).toBe(false);
  });
});

describe("sanitizePronouns", () => {
  it("conserve les clés prédéfinies telles quelles", () => {
    expect(sanitizePronouns(["he_him", "any"])).toEqual(["he_him", "any"]);
  });

  it("trim et tronque les valeurs libres", () => {
    const long = "x".repeat(PRONOUN_CUSTOM_MAX_LENGTH + 10);
    const result = sanitizePronouns([`  ${long}  `]);
    expect(result[0]).toHaveLength(PRONOUN_CUSTOM_MAX_LENGTH);
  });

  it("déduplique", () => {
    expect(sanitizePronouns(["he_him", "he_him", "he_him"])).toEqual(["he_him"]);
  });

  it("ignore les entrées vides", () => {
    expect(sanitizePronouns(["", "   ", "any"])).toEqual(["any"]);
  });

  it("limite à PRONOUNS_MAX_COUNT entrées", () => {
    const result = sanitizePronouns(["he_him", "she_her", "they_them", "any", "ask_me"]);
    expect(result).toHaveLength(PRONOUNS_MAX_COUNT);
    expect(result).toEqual(["he_him", "she_her", "they_them"]);
  });
});
