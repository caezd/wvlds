import { describe, it, expect } from "vitest";
import { validateChallenge } from "@/lib/validateChallenge";
import type { ValidationKind } from "@/types/db";

// Textes de base suffisamment longs pour passer le min_word_count par défaut (20 mots)
const LONG =
  "Le chevalier traversa la forêt sombre sans un mot, l'épée au côté, le regard fixe sur l'horizon lointain et brumeux.";
const SHORT = "Juste quelques mots.";

// ---------------------------------------------------------------------------
// contains_word
// ---------------------------------------------------------------------------

describe("contains_word", () => {
  const v: ValidationKind = { kind: "contains_word", value: "miroir" };

  it("valide quand le mot est présent (exact)", () => {
    expect(validateChallenge(`${LONG} Il vit son reflet dans un miroir.`, v, 20)).toBe(true);
  });

  it("valide quand le mot est présent en majuscules", () => {
    expect(validateChallenge(`${LONG} Un MIROIR était posé là.`, v, 20)).toBe(true);
  });

  it("échoue quand le mot est absent", () => {
    expect(validateChallenge(LONG, v, 20)).toBe(false);
  });

  it("échoue si le message est trop court (min_word_count)", () => {
    expect(validateChallenge("Un miroir.", v, 20)).toBe(false);
  });

  it("passe si min_word_count est 0", () => {
    expect(validateChallenge("Un miroir.", v, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// no_word
// ---------------------------------------------------------------------------

describe("no_word", () => {
  const v: ValidationKind = { kind: "no_word", value: "soudain" };

  it("valide quand le mot interdit est absent", () => {
    expect(validateChallenge(LONG, v, 20)).toBe(true);
  });

  it("échoue quand le mot interdit est présent", () => {
    expect(validateChallenge(`${LONG} Soudain, un bruit retentit.`, v, 20)).toBe(false);
  });

  it("échoue si le mot interdit est présent en minuscules", () => {
    expect(validateChallenge(`${LONG} Il entendit soudain quelque chose.`, v, 20)).toBe(false);
  });

  it("échoue si le message est trop court", () => {
    expect(validateChallenge("Aucun mot interdit ici.", v, 20)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// word_count_range
// ---------------------------------------------------------------------------

describe("word_count_range", () => {
  const v: ValidationKind = { kind: "word_count_range", min: 10, max: 20 };

  it("valide un message dans la plage exacte", () => {
    // 15 mots
    const text = "Le soleil se lève sur la montagne enneigée et les oiseaux chantent dans la forêt.";
    expect(validateChallenge(text, v, 0)).toBe(true);
  });

  it("valide à la borne inférieure (10 mots)", () => {
    const text = "Un deux trois quatre cinq six sept huit neuf dix.";
    expect(validateChallenge(text, v, 0)).toBe(true);
  });

  it("valide à la borne supérieure (20 mots)", () => {
    const text = "a b c d e f g h i j k l m n o p q r s t.";
    expect(validateChallenge(text, v, 0)).toBe(true);
  });

  it("échoue en dessous de la borne inférieure (9 mots)", () => {
    const text = "Un deux trois quatre cinq six sept huit neuf.";
    // 9 mots
    expect(validateChallenge(text, v, 0)).toBe(false);
  });

  it("échoue au dessus de la borne supérieure (21 mots)", () => {
    const text = "a b c d e f g h i j k l m n o p q r s t u.";
    expect(validateChallenge(text, v, 0)).toBe(false);
  });

  it("ignore min_word_count externe (la plage fait office de seuil)", () => {
    // 5 mots — en dessous de min externe (20), mais word_count_range gère sa propre logique
    // Ici 5 mots < min:10, donc false quand même, mais pour la raison du range
    const text = "Un deux trois quatre cinq.";
    expect(validateChallenge(text, v, 20)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// starts_with
// ---------------------------------------------------------------------------

describe("starts_with", () => {
  const v: ValidationKind = { kind: "starts_with", value: "Dans l'obscurité" };

  it("valide quand le message commence par le préfixe", () => {
    const text = `Dans l'obscurité, le héros avança les mains tendues devant lui, cherchant une issue dans ce couloir sans fin ni lumière.`;
    expect(validateChallenge(text, v, 20)).toBe(true);
  });

  it("valide sans tenir compte de la casse", () => {
    // 22 mots — DANS L'OBSCURITÉ il régnait un calme absolu le vent soufflait à travers les vieux arbres centenaires de la forêt silencieuse et froide
    const text = `DANS L'OBSCURITÉ il régnait un calme absolu, le vent soufflait à travers les vieux arbres centenaires de la forêt silencieuse et froide.`;
    expect(validateChallenge(text, v, 20)).toBe(true);
  });

  it("valide en ignorant les espaces en tête", () => {
    // 20 mots — Dans l'obscurité le personnage avançait à tâtons les bras tendus devant lui cherchant une issue dans les couloirs du château
    const text = `   Dans l'obscurité le personnage avançait à tâtons, les bras tendus devant lui, cherchant une issue dans les couloirs du château.`;
    expect(validateChallenge(text, v, 20)).toBe(true);
  });

  it("échoue quand le message ne commence pas par le préfixe", () => {
    const text = `Il avançait dans l'obscurité totale, sans lumière ni repère, perdu dans ce dédale de couloirs obscurs et silencieux.`;
    expect(validateChallenge(text, v, 20)).toBe(false);
  });

  it("échoue si le message est trop court", () => {
    expect(validateChallenge("Dans l'obscurité.", v, 20)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ends_with_question
// ---------------------------------------------------------------------------

describe("ends_with_question", () => {
  const v: ValidationKind = { kind: "ends_with_question" };

  it("valide quand le message se termine par ?", () => {
    expect(validateChallenge(`${LONG} Mais où allait-il vraiment ?`, v, 20)).toBe(true);
  });

  it("valide avec des espaces après le ?", () => {
    expect(validateChallenge(`${LONG} Que se passa-t-il ensuite ?   `, v, 20)).toBe(true);
  });

  it("échoue quand le message se termine par un point", () => {
    expect(validateChallenge(`${LONG} Il arriva enfin à destination.`, v, 20)).toBe(false);
  });

  it("échoue quand le message se termine par !", () => {
    expect(validateChallenge(`${LONG} Quelle surprise !`, v, 20)).toBe(false);
  });

  it("échoue si le message est trop court", () => {
    expect(validateChallenge("Où suis-je ?", v, 20)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// no_adverb_ly
// ---------------------------------------------------------------------------

describe("no_adverb_ly", () => {
  const v: ValidationKind = { kind: "no_adverb_ly" };

  it("valide un message sans adverbe en -ment", () => {
    expect(validateChallenge(LONG, v, 20)).toBe(true);
  });

  it("échoue avec rapidement (-ement)", () => {
    expect(validateChallenge(`${LONG} Il courut rapidement vers la sortie.`, v, 20)).toBe(false);
  });

  it("échoue avec élégamment (-amment)", () => {
    expect(validateChallenge(`${LONG} Elle s'inclina élégamment devant lui.`, v, 20)).toBe(false);
  });

  it("échoue avec apparemment (-emment)", () => {
    expect(validateChallenge(`${LONG} Apparemment, il n'était pas seul.`, v, 20)).toBe(false);
  });

  it("ne bloque PAS 'moment' (se termine en -ent, pas -ement)", () => {
    expect(validateChallenge(`${LONG} Ce moment était décisif pour lui.`, v, 20)).toBe(true);
  });

  it("ne bloque PAS 'document'", () => {
    expect(validateChallenge(`${LONG} Il tenait un document dans ses mains.`, v, 20)).toBe(true);
  });

  it("ne bloque PAS 'argument'", () => {
    expect(validateChallenge(`${LONG} Son argument était solide et convaincant.`, v, 20)).toBe(true);
  });

  it("bloque 'gouvernement' (faux positif accepté — finit en -ement)", () => {
    // Le regex \b\w+(ement)\b correspond à "gouvern-ement".
    // Ce faux positif est documenté dans validateChallenge.ts et accepté.
    expect(validateChallenge(`${LONG} Le gouvernement avait pris sa décision.`, v, 20)).toBe(false);
  });

  it("échoue si le message est trop court", () => {
    expect(validateChallenge("Pas d'adverbe ici vraiment.", v, 20)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// contains_regex
// ---------------------------------------------------------------------------

describe("contains_regex", () => {
  const v: ValidationKind = {
    kind: "contains_regex",
    pattern: "\\b(sang|larmes|sueur)\\b",
  };

  it("valide quand un des mots du motif est présent", () => {
    expect(validateChallenge(`${LONG} Des larmes coulaient sur son visage.`, v, 20)).toBe(true);
  });

  it("valide avec 'sang'", () => {
    expect(validateChallenge(`${LONG} Le sang tachait la pierre froide.`, v, 20)).toBe(true);
  });

  it("échoue quand aucun mot du motif n'est présent", () => {
    expect(validateChallenge(LONG, v, 20)).toBe(false);
  });

  it("échoue si le message est trop court", () => {
    expect(validateChallenge("Des larmes.", v, 20)).toBe(false);
  });

  it("retourne false pour un motif regex invalide (pas d'exception)", () => {
    const bad: ValidationKind = { kind: "contains_regex", pattern: "([invalid" };
    expect(validateChallenge(LONG, bad, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// min_word_count — vérification transversale
// ---------------------------------------------------------------------------

describe("min_word_count (transversal)", () => {
  it("un message de exactement min mots passe le seuil", () => {
    // 20 mots exactement
    const text = "a b c d e f g h i j k l m n o p q r s t";
    const v: ValidationKind = { kind: "no_word", value: "zzz" };
    expect(validateChallenge(text, v, 20)).toBe(true);
  });

  it("un message de min-1 mots échoue", () => {
    const text = "a b c d e f g h i j k l m n o p q r s";
    const v: ValidationKind = { kind: "no_word", value: "zzz" };
    expect(validateChallenge(text, v, 20)).toBe(false);
  });

  it("min_word_count=0 désactive le seuil", () => {
    const v: ValidationKind = { kind: "ends_with_question" };
    expect(validateChallenge("Vraiment ?", v, 0)).toBe(true);
  });
});
