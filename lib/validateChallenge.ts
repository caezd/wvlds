import type { ValidationKind } from "@/types/db";

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Valide le contenu d'un message contre une règle de défi.
 * Retourne true si le défi est relevé.
 *
 * Pour `no_adverb_ly` : détecte les terminaisons -ement / -amment / -emment
 * (typiques des adverbes français). Les mots comme "moment", "document",
 * "argument" se terminent en -ent et ne sont PAS confondus.
 */
export function validateChallenge(
  content: string,
  validation: ValidationKind,
  minWordCount: number,
): boolean {
  // Vérification du nombre de mots minimum (sauf pour word_count_range qui définit la sienne)
  if (validation.kind !== "word_count_range" && wordCount(content) < minWordCount) {
    return false;
  }

  const lower = content.toLowerCase();

  switch (validation.kind) {
    case "contains_word":
      return lower.includes(validation.value.toLowerCase());

    case "no_word":
      return !lower.includes(validation.value.toLowerCase());

    case "word_count_range": {
      const wc = wordCount(content);
      return wc >= validation.min && wc <= validation.max;
    }

    case "starts_with":
      return content.trimStart().toLowerCase().startsWith(validation.value.toLowerCase());

    case "ends_with_question":
      return content.trimEnd().endsWith("?");

    case "no_adverb_ly":
      // -ement (rapidement), -amment (élégamment), -emment (apparemment)
      // Faux positifs possibles : appartement, gouvernement, fondement — acceptés
      // \p{L} couvre les lettres Unicode (é, è, â…) que \w ignore en JS
      return !/[\p{L}]+(ement|amment|emment)(?![\p{L}])/u.test(content);

    case "contains_regex":
      try {
        return new RegExp(validation.pattern, "i").test(content);
      } catch {
        return false;
      }
  }
}
