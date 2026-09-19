// Validation des fiches de persona (migration 181) : brouillon → soumise →
// validée, et complétude vis-à-vis des champs obligatoires du modèle. La base
// fait foi (`review_status`, `sheet_complete`) ; ce module lit ces deux
// colonnes pour l'interface.

import type { PersonaReviewStatus } from "@/types/db";

export const PERSONA_REVIEW_STATUSES: readonly PersonaReviewStatus[] = ["draft", "submitted", "approved"];

export function reviewStatusOf(value: unknown): PersonaReviewStatus {
  return value === "draft" || value === "submitted" ? value : "approved";
}

/**
 * Ce que la fiche affiche : « incomplète » l'emporte, une fiche validée
 * n'affiche rien. `reviewActive` (migration 184) : le monde relit-il ses
 * fiches (option + fiche par défaut) ? Sinon l'état de relecture ne dit rien.
 */
export type PersonaSheetBadgeKind = "incomplete" | "draft" | "submitted" | "approved";

export function sheetBadgeOf(
  persona: { review_status?: unknown; sheet_complete?: boolean | null },
  reviewActive = true,
): PersonaSheetBadgeKind | null {
  if (persona.sheet_complete === false) return "incomplete";
  if (!reviewActive) return null;
  const status = reviewStatusOf(persona.review_status);
  return status === "approved" ? null : status;
}

/** Pourquoi un persona ne peut pas jouer, hors quota — `null` s'il peut. */
export function personaReviewLock(
  persona: { review_status?: unknown; sheet_complete?: boolean | null },
  reviewActive = true,
): "incomplete" | "unreviewed" | null {
  if (persona.sheet_complete === false) return "incomplete";
  if (!reviewActive) return null;
  return reviewStatusOf(persona.review_status) === "approved" ? null : "unreviewed";
}
