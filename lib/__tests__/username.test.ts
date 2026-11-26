import { describe, it, expect } from "vitest";
import { usernameProblem, USERNAME_MAX, USERNAME_MIN } from "@/lib/username";

describe("usernameProblem (format du pseudo, migration 266)", () => {
  it("accepte lettres, chiffres et tiret bas, de 3 à 32 caractères", () => {
    expect(usernameProblem("Lia_92")).toBeNull();
    expect(usernameProblem("abc")).toBeNull();
    expect(usernameProblem("a".repeat(USERNAME_MAX))).toBeNull();
  });

  it("vide : rien à signaler encore", () => {
    expect(usernameProblem("")).toBe("empty");
  });

  it("refuse les espaces, même en bout de chaîne", () => {
    expect(usernameProblem("mon pseudo")).toBe("spaces");
    expect(usernameProblem(" lia")).toBe("spaces");
  });

  it("refuse les accents et la ponctuation", () => {
    expect(usernameProblem("élodie")).toBe("invalidChars");
    expect(usernameProblem("lia-92")).toBe("invalidChars");
    expect(usernameProblem("lia.92")).toBe("invalidChars");
  });

  it("refuse trop court et trop long", () => {
    expect(usernameProblem("a".repeat(USERNAME_MIN - 1))).toBe("tooShort");
    expect(usernameProblem("a".repeat(USERNAME_MAX + 1))).toBe("tooLong");
  });
});
