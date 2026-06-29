import { describe, it, expect } from "vitest";
import {
  templateNoWord,
  templateWordCountRange,
  templateStartsWith,
  templateEndsWithQuestion,
  templateNoAdverbLy,
  templateContainsRegex,
  CHALLENGE_CATALOG,
  CHALLENGE_KINDS,
  WORDS_FORBIDDEN,
  INCIPITS,
  WORD_COUNT_RANGES,
  REGEX_OPTIONS,
  pickRandomChallenge,
  type ChallengeTemplate,
} from "@/lib/challengeTemplates";
import { validateChallenge } from "@/lib/validateChallenge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidTemplate(t: ChallengeTemplate) {
  expect(t.title).toBeTruthy();
  expect(t.description).toBeTruthy();
  expect(t.validation).toBeDefined();
  expect(t.min_word_count).toBeGreaterThanOrEqual(0);
  expect(t.reward_coins).toBeGreaterThan(0);
  expect(t.reward_xp).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// templateNoWord
// ---------------------------------------------------------------------------

describe("templateNoWord", () => {
  it("génère un template valide", () => {
    isValidTemplate(templateNoWord("soudain"));
  });

  it("intègre le mot interdit dans titre et description", () => {
    const t = templateNoWord("mais");
    expect(t.title).toContain("mais");
    expect(t.description).toContain("mais");
  });

  it("produit une validation no_word avec la bonne valeur", () => {
    const t = templateNoWord("soudain");
    expect(t.validation).toEqual({ kind: "no_word", value: "soudain" });
  });

  it("est cohérent avec validateChallenge", () => {
    const t = templateNoWord("soudain");
    const long = "a b c d e f g h i j k l m n o p q r s t u v w.";
    expect(validateChallenge(long, t.validation, t.min_word_count)).toBe(true);
    const withWord = long + " Soudain tout changea.";
    expect(validateChallenge(withWord, t.validation, t.min_word_count)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// templateWordCountRange
// ---------------------------------------------------------------------------

describe("templateWordCountRange", () => {
  it("génère un template valide", () => {
    isValidTemplate(templateWordCountRange(10, 20));
  });

  it("intègre les bornes dans titre et description", () => {
    const t = templateWordCountRange(150, 250);
    expect(t.title).toContain("150");
    expect(t.title).toContain("250");
    expect(t.description).toContain("150");
    expect(t.description).toContain("250");
  });

  it("a min_word_count=0 (la plage fait office de contrainte)", () => {
    expect(templateWordCountRange(10, 20).min_word_count).toBe(0);
  });

  it("produit une validation word_count_range correcte", () => {
    const t = templateWordCountRange(15, 30);
    expect(t.validation).toEqual({ kind: "word_count_range", min: 15, max: 30 });
  });

  it("est cohérent avec validateChallenge (dans la plage)", () => {
    const t = templateWordCountRange(3, 5);
    expect(validateChallenge("un deux trois", t.validation, t.min_word_count)).toBe(true);
    expect(validateChallenge("un deux", t.validation, t.min_word_count)).toBe(false);
    expect(validateChallenge("a b c d e f", t.validation, t.min_word_count)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// templateStartsWith
// ---------------------------------------------------------------------------

describe("templateStartsWith", () => {
  it("génère un template valide", () => {
    isValidTemplate(templateStartsWith("Dans l'obscurité"));
  });

  it("intègre le préfixe dans titre et description", () => {
    const t = templateStartsWith("Je n'aurais jamais");
    expect(t.title).toContain("Je n'aurais jamais");
    expect(t.description).toContain("Je n'aurais jamais");
  });

  it("produit une validation starts_with correcte", () => {
    const t = templateStartsWith("Il était une fois");
    expect(t.validation).toEqual({ kind: "starts_with", value: "Il était une fois" });
  });

  it("est cohérent avec validateChallenge", () => {
    const t = templateStartsWith("Autrefois");
    // 22 mots — Autrefois les chevaliers parcouraient la vaste terre pour trouver la vérité cachée au fond des âges lointains oubliés et perdus à jamais
    const long = "Autrefois les chevaliers parcouraient la vaste terre pour trouver la vérité cachée au fond des âges lointains, oubliés et perdus à jamais.";
    expect(validateChallenge(long, t.validation, t.min_word_count)).toBe(true);
    // 22 mots — même longueur mais ne commence pas par "Autrefois"
    const bad = "Il y a longtemps, autrefois dans un monde lointain et mystérieux plein de magie, d'aventures et d'histoires épiques et profondes.";
    expect(validateChallenge(bad, t.validation, t.min_word_count)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// templateEndsWithQuestion
// ---------------------------------------------------------------------------

describe("templateEndsWithQuestion", () => {
  it("génère un template valide", () => {
    isValidTemplate(templateEndsWithQuestion());
  });

  it("mentionne le point d'interrogation dans la description", () => {
    const t = templateEndsWithQuestion();
    expect(t.description).toContain("?");
  });

  it("produit une validation ends_with_question", () => {
    const t = templateEndsWithQuestion();
    expect(t.validation).toEqual({ kind: "ends_with_question" });
  });

  it("est cohérent avec validateChallenge", () => {
    const t = templateEndsWithQuestion();
    const long = "a b c d e f g h i j k l m n o p q r s t Est-ce que cela avait un sens ?";
    expect(validateChallenge(long, t.validation, t.min_word_count)).toBe(true);
    const noQ = "a b c d e f g h i j k l m n o p q r s t Il n'y avait pas de question.";
    expect(validateChallenge(noQ, t.validation, t.min_word_count)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// templateNoAdverbLy
// ---------------------------------------------------------------------------

describe("templateNoAdverbLy", () => {
  it("génère un template valide", () => {
    isValidTemplate(templateNoAdverbLy());
  });

  it("mentionne -ment dans la description", () => {
    const t = templateNoAdverbLy();
    expect(t.description).toContain("-ment");
  });

  it("a des récompenses supérieures (défi plus difficile)", () => {
    const t = templateNoAdverbLy();
    expect(t.reward_coins).toBeGreaterThanOrEqual(20);
  });

  it("est cohérent avec validateChallenge", () => {
    const t = templateNoAdverbLy();
    // 20 mots — Le soleil brillait sur la vaste plaine dorée les oiseaux chantaient et le vent soufflait fort dans les grands arbres
    const clean = "Le soleil brillait sur la vaste plaine dorée, les oiseaux chantaient et le vent soufflait fort dans les grands arbres.";
    expect(validateChallenge(clean, t.validation, t.min_word_count)).toBe(true);
    // 22 mots avec "vigoureusement" (adverbe en -ment)
    const bad = "Le soleil brillait vigoureusement sur la plaine et les oiseaux chantaient, le vent soufflait fort dans les grands arbres dorés.";
    expect(validateChallenge(bad, t.validation, t.min_word_count)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// templateContainsRegex
// ---------------------------------------------------------------------------

describe("templateContainsRegex", () => {
  it("génère un template valide", () => {
    isValidTemplate(templateContainsRegex("\\b(sang|larmes)\\b", "sang ou larmes"));
  });

  it("intègre le label dans titre et description", () => {
    const t = templateContainsRegex("\\d+", "un nombre");
    expect(t.title).toContain("un nombre");
    expect(t.description).toContain("un nombre");
  });

  it("produit une validation contains_regex correcte", () => {
    const t = templateContainsRegex("\\b(a|b)\\b", "a ou b");
    expect(t.validation).toEqual({ kind: "contains_regex", pattern: "\\b(a|b)\\b" });
  });

  it("a des récompenses supérieures par défaut", () => {
    const t = templateContainsRegex("x", "x");
    expect(t.reward_coins).toBeGreaterThanOrEqual(25);
  });

  it("est cohérent avec validateChallenge", () => {
    const t = templateContainsRegex("\\b(sang|larmes|sueur)\\b", "sang, larmes ou sueur");
    const long = "a b c d e f g h i j k l m n o p q r s t Des larmes coulaient sur son visage.";
    expect(validateChallenge(long, t.validation, t.min_word_count)).toBe(true);
    expect(validateChallenge("a b c d e f g h i j k l m n o p q r s t u v.", t.validation, t.min_word_count)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CHALLENGE_CATALOG
// ---------------------------------------------------------------------------

describe("CHALLENGE_CATALOG", () => {
  it("contient exactement un template de chaque kind du pool", () => {
    const kinds = new Set(CHALLENGE_CATALOG.map((t) => t.validation.kind));
    expect(kinds.size).toBe(6);
    expect(kinds.has("no_word")).toBe(true);
    expect(kinds.has("word_count_range")).toBe(true);
    expect(kinds.has("starts_with")).toBe(true);
    expect(kinds.has("ends_with_question")).toBe(true);
    expect(kinds.has("no_adverb_ly")).toBe(true);
    expect(kinds.has("contains_regex")).toBe(true);
  });

  it("chaque entrée du catalogue est un template valide", () => {
    for (const t of CHALLENGE_CATALOG) {
      isValidTemplate(t);
    }
  });

  it("aucun titre n'est dupliqué", () => {
    const titles = CHALLENGE_CATALOG.map((t) => t.title);
    const unique = new Set(titles);
    expect(unique.size).toBe(titles.length);
  });

  it("les patterns regex du catalogue sont tous valides", () => {
    for (const t of CHALLENGE_CATALOG) {
      const validation = t.validation;
      if (validation.kind === "contains_regex") {
        expect(() => new RegExp(validation.pattern)).not.toThrow();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Dictionnaires
// ---------------------------------------------------------------------------

describe("Dictionnaires", () => {
  it("WORDS_FORBIDDEN — au moins 10 entrées, toutes non-vides", () => {
    expect(WORDS_FORBIDDEN.length).toBeGreaterThanOrEqual(10);
    for (const w of WORDS_FORBIDDEN) expect(w.trim()).toBeTruthy();
  });

  it("INCIPITS — au moins 5 entrées, toutes non-vides", () => {
    expect(INCIPITS.length).toBeGreaterThanOrEqual(5);
    for (const s of INCIPITS) expect(s.trim()).toBeTruthy();
  });

  it("WORD_COUNT_RANGES — plages valides (min < max, min >= 50)", () => {
    for (const [min, max] of WORD_COUNT_RANGES) {
      expect(min).toBeGreaterThanOrEqual(50);
      expect(max).toBeGreaterThan(min);
    }
  });

  it("REGEX_OPTIONS — patterns valides et labels non-vides", () => {
    for (const { pattern, label } of REGEX_OPTIONS) {
      expect(label.trim()).toBeTruthy();
      expect(() => new RegExp(pattern, "i")).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// pickRandomChallenge
// ---------------------------------------------------------------------------

describe("pickRandomChallenge", () => {
  it("retourne un template valide", () => {
    isValidTemplate(pickRandomChallenge());
  });

  it("couvre tous les kinds du pool sur 200 tirages (pas contains_word)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(pickRandomChallenge().validation.kind);
    }
    expect(seen.has("contains_word")).toBe(false);
    for (const kind of CHALLENGE_KINDS) {
      expect(seen.has(kind), `kind "${kind}" jamais tiré`).toBe(true);
    }
  });

  it("ne produit pas deux fois le même template d'affilée (hors hasard)", () => {
    // 50 tirages — si tous identiques, la randomisation est cassée
    const titles = Array.from({ length: 50 }, () => pickRandomChallenge().title);
    const unique = new Set(titles);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("chaque kind a une probabilité approximativement égale sur 600 tirages", () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 600; i++) {
      const kind = pickRandomChallenge().validation.kind;
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    const expected = 600 / 6; // 100 par kind
    for (const kind of CHALLENGE_KINDS) {
      const count = counts[kind] ?? 0;
      // tolérance ±60% — teste que chaque kind est bien représenté
      expect(count, `kind "${kind}" sous-représenté (${count}/700)`).toBeGreaterThan(expected * 0.4);
    }
  });
});
