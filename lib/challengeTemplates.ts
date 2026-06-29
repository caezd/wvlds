import type { ValidationKind } from "@/types/db";

export type ChallengeTemplate = {
  title: string;
  description: string;
  validation: ValidationKind;
  /** Nombre de mots minimum requis (0 = pas de contrainte). */
  min_word_count: number;
  reward_coins: number;
  reward_xp: number;
};

// ---------------------------------------------------------------------------
// Templates par kind
// ---------------------------------------------------------------------------

export function templateNoWord(
  word: string,
  opts?: { min_word_count?: number; reward_coins?: number; reward_xp?: number },
): ChallengeTemplate {
  return {
    title: `Mot interdit : « ${word} »`,
    description: `Rédigez votre prochain message **sans utiliser** le mot **« ${word} »**.\n\n*Un seul écart et le défi est perdu.*`,
    validation: { kind: "no_word", value: word },
    min_word_count: opts?.min_word_count ?? 20,
    reward_coins: opts?.reward_coins ?? 15,
    reward_xp: opts?.reward_xp ?? 10,
  };
}

export function templateWordCountRange(
  min: number,
  max: number,
  opts?: { reward_coins?: number; reward_xp?: number },
): ChallengeTemplate {
  return {
    title: `Longueur exacte : ${min}–${max} mots`,
    description: `Rédigez un message comportant **entre ${min} et ${max} mots**.\n\n*Un développement narratif complet — posez le décor, les émotions, l'action.*`,
    validation: { kind: "word_count_range", min, max },
    min_word_count: 0,
    reward_coins: opts?.reward_coins ?? 15,
    reward_xp: opts?.reward_xp ?? 10,
  };
}

export function templateStartsWith(
  prefix: string,
  opts?: { min_word_count?: number; reward_coins?: number; reward_xp?: number },
): ChallengeTemplate {
  return {
    title: `Incipit imposé : « ${prefix} »`,
    description: `Commencez votre message par **« ${prefix} »**.\n\n*Les premières lettres comptent — lancez-vous avec style.*`,
    validation: { kind: "starts_with", value: prefix },
    min_word_count: opts?.min_word_count ?? 20,
    reward_coins: opts?.reward_coins ?? 15,
    reward_xp: opts?.reward_xp ?? 10,
  };
}

export function templateEndsWithQuestion(
  opts?: { min_word_count?: number; reward_coins?: number; reward_xp?: number },
): ChallengeTemplate {
  return {
    title: "Question finale",
    description: `Terminez votre message par une **question**.\n\n*Votre réponse doit se conclure par un point d'interrogation « ? ».*`,
    validation: { kind: "ends_with_question" },
    min_word_count: opts?.min_word_count ?? 20,
    reward_coins: opts?.reward_coins ?? 15,
    reward_xp: opts?.reward_xp ?? 10,
  };
}

export function templateNoAdverbLy(
  opts?: { min_word_count?: number; reward_coins?: number; reward_xp?: number },
): ChallengeTemplate {
  return {
    title: "Pas d'adverbe en -ment",
    description: `Rédigez votre message **sans utiliser d'adverbe** se terminant par **-ment**, **-amment** ou **-emment**.\n\n*Interdits : rapidement, élégamment, apparemment…*`,
    validation: { kind: "no_adverb_ly" },
    min_word_count: opts?.min_word_count ?? 20,
    reward_coins: opts?.reward_coins ?? 20,
    reward_xp: opts?.reward_xp ?? 15,
  };
}

export function templateContainsRegex(
  pattern: string,
  label: string,
  opts?: { min_word_count?: number; reward_coins?: number; reward_xp?: number },
): ChallengeTemplate {
  return {
    title: `Motif imposé : ${label}`,
    description: `Votre message doit mentionner **au moins un** des éléments suivants : *${label}*.\n\n*L'intensité dramatique est de mise.*`,
    validation: { kind: "contains_regex", pattern },
    min_word_count: opts?.min_word_count ?? 20,
    reward_coins: opts?.reward_coins ?? 25,
    reward_xp: opts?.reward_xp ?? 20,
  };
}

// ---------------------------------------------------------------------------
// Dictionnaires — piochés aléatoirement par kind
// ---------------------------------------------------------------------------

/** Mots interdits dans le message. */
export const WORDS_FORBIDDEN = [
  "soudain", "mais", "alors", "vraiment", "donc",
  "car", "pourtant", "cependant", "néanmoins", "toutefois",
  "aussi", "ainsi", "encore", "toujours", "jamais",
  "bien", "très", "plutôt", "enfin", "quand",
];

/** Phrases d'amorce imposées en début de message. */
export const INCIPITS = [
  "Dans l'obscurité",
  "Je n'aurais jamais",
  "Autrefois",
  "Il était une fois",
  "Sous un ciel de plomb",
  "Tout avait commencé",
  "Elle ne l'avait pas vu venir",
  "Le silence était total",
  "Au bout du chemin",
  "Personne ne savait",
  "Depuis ce jour-là",
  "Il ne restait plus rien",
  "La nuit où tout a basculé",
  "Ce n'était pas la première fois",
  "Quelque chose avait changé",
];

/** Plages de longueur en mots [min, max]. */
export const WORD_COUNT_RANGES: Array<[number, number]> = [
  [100, 120],
  [150, 170],
  [200, 220],
  [250, 270],
];

/** Options pour les défis regex — pattern + label lisible. */
export const REGEX_OPTIONS: Array<{ pattern: string; label: string }> = [
  { pattern: "\\b(sang|larmes|sueur)\\b",        label: "sang, larmes ou sueur" },
  { pattern: "\\b(jamais|toujours|parfois)\\b",   label: "jamais, toujours ou parfois" },
  { pattern: "\\b(lumière|ombre)\\b",              label: "lumière ou ombre" },
  { pattern: "\\b(peur|crainte|effroi)\\b",        label: "peur, crainte ou effroi" },
  { pattern: "\\b(amour|haine|tendresse)\\b",      label: "amour, haine ou tendresse" },
  { pattern: "\\b(feu|flamme|braise)\\b",          label: "feu, flamme ou braise" },
  { pattern: "\\b(mer|vague|tempête)\\b",          label: "mer, vague ou tempête" },
  { pattern: "\\b(nuit|aube|crépuscule)\\b",       label: "nuit, aube ou crépuscule" },
];

// ---------------------------------------------------------------------------
// Pools par kind — chaque kind a une probabilité égale
// ---------------------------------------------------------------------------

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CHALLENGE_POOLS = {
  no_word:            () => templateNoWord(pick(WORDS_FORBIDDEN)),
  word_count_range:   () => { const [min, max] = pick(WORD_COUNT_RANGES); return templateWordCountRange(min, max); },
  starts_with:        () => templateStartsWith(pick(INCIPITS)),
  ends_with_question: () => templateEndsWithQuestion(),
  no_adverb_ly:       () => templateNoAdverbLy(),
  contains_regex:     () => { const opt = pick(REGEX_OPTIONS); return templateContainsRegex(opt.pattern, opt.label); },
} as const;

export type ChallengeKind = keyof typeof CHALLENGE_POOLS;

export const CHALLENGE_KINDS = Object.keys(CHALLENGE_POOLS) as ChallengeKind[];

/**
 * Retourne un défi aléatoire.
 * Chaque kind a une probabilité égale (1/7), indépendamment du nombre d'options dans son dictionnaire.
 */
export function pickRandomChallenge(): ChallengeTemplate {
  return CHALLENGE_POOLS[pick(CHALLENGE_KINDS)]();
}

// ---------------------------------------------------------------------------
// Catalogue de référence — un exemple par kind (tests, doc, Edge Function)
// ---------------------------------------------------------------------------

export const CHALLENGE_CATALOG: ChallengeTemplate[] = [
  templateNoWord("soudain"),
  templateWordCountRange(150, 250),
  templateStartsWith("Dans l'obscurité"),
  templateEndsWithQuestion(),
  templateNoAdverbLy(),
  templateContainsRegex("\\b(sang|larmes|sueur)\\b", "sang, larmes ou sueur"),
];
