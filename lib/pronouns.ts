// Pronoms prédéfinis affichables sur la carte profil. Les valeurs stockées en
// base (profiles.pronouns) sont soit une de ces clés, soit une chaîne libre
// (option "autre") — voir isPronounOption pour distinguer les deux au rendu.

export const PRONOUN_OPTIONS = [
  "he_him",
  "she_her",
  "they_them",
  "he_they",
  "she_they",
  "any",
  "ask_me",
] as const;

export type PronounOption = (typeof PRONOUN_OPTIONS)[number];

export const PRONOUNS_MAX_COUNT = 3;
export const PRONOUN_CUSTOM_MAX_LENGTH = 40;

export function isPronounOption(value: string): value is PronounOption {
  return (PRONOUN_OPTIONS as readonly string[]).includes(value);
}

/** Nettoie et déduplique une liste de pronoms avant sauvegarde. */
export function sanitizePronouns(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = isPronounOption(raw) ? raw : raw.trim().slice(0, PRONOUN_CUSTOM_MAX_LENGTH);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= PRONOUNS_MAX_COUNT) break;
  }
  return out;
}
