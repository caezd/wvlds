// lib/personaEligibility.ts
// Reflète côté client la règle appliquée en base (migration 090,
// is_persona_usable) : en plan gratuit, seuls les FREE_PERSONAS_PER_WORLD
// personas les plus anciens (created_at) d'un monde restent utilisables pour
// poster un message. Les personas au-delà restent visibles/éditables — seule
// la sélection pour POSTER est restreinte. Abonné/lifetime : aucune limite.
//
// Pure, sans I/O : à appeler avec les personas d'UN SEUL (utilisateur, monde),
// comme le fait déjà PersonaPickerDialog/PersonaProfileSheet.

import { FREE_PERSONAS_PER_WORLD } from "@/lib/personaQuotaConstants";
import { personaReviewLock } from "@/lib/personaReview";

export type EligibilityPersona = {
  id: string;
  created_at: string;
  is_template?: boolean | null;
  /** Migration 181 : une fiche non validée ou incomplète ne joue pas, quel que soit le plan. */
  review_status?: string | null;
  sheet_complete?: boolean | null;
};

const UNLIMITED_PLANS = new Set(["subscribed", "lifetime"]);

/**
 * Renvoie l'ensemble des ids de personas utilisables pour poster, parmi les
 * personas d'un même (utilisateur, monde). `personas` ne doit contenir que des
 * personas non-templates du monde concerné (comme déjà fait par les appelants).
 */
export function getUsablePersonaIds(
  personas: EligibilityPersona[],
  plan: string | null | undefined,
): Set<string> {
  const candidates = personas.filter((p) => !p.is_template);
  // Le quota se compte sur tous les personas du monde (validés ou non) ; le
  // filtre de validation s'applique ensuite, comme `is_persona_usable`.
  const reviewed = (list: EligibilityPersona[]) => list.filter((p) => personaReviewLock(p) === null);

  if (plan && UNLIMITED_PLANS.has(plan)) {
    return new Set(reviewed(candidates).map((p) => p.id));
  }

  const eligible = [...candidates]
    .sort((a, b) => {
      // Date invalide/absente => traitée comme "la plus récente" (désavantagée
      // dans le classement) plutôt que de produire NaN (comparateur invalide).
      const rawA = new Date(a.created_at).getTime();
      const rawB = new Date(b.created_at).getTime();
      const ta = Number.isNaN(rawA) ? Infinity : rawA;
      const tb = Number.isNaN(rawB) ? Infinity : rawB;
      // Départage déterministe (mêmes horodatages) — même tie-break que
      // `ORDER BY created_at ASC, id ASC` côté base.
      return ta !== tb ? ta - tb : a.id.localeCompare(b.id);
    })
    .slice(0, FREE_PERSONAS_PER_WORLD);

  return new Set(reviewed(eligible).map((p) => p.id));
}

/** La clé i18n (namespace `personas`) qui explique un verrou. */
export const LOCK_REASON_KEYS = {
  quota: "lockedHint",
  incomplete: "sheet.lockedIncomplete",
  unreviewed: "sheet.lockedUnreviewed",
} as const;

/**
 * Pourquoi un persona n'est pas sélectionnable : sa fiche (incomplète, non
 * validée) avant le quota — c'est ce que le joueur peut corriger.
 */
export function personaLockReason(
  persona: EligibilityPersona,
  usableIds: Set<string>,
): "incomplete" | "unreviewed" | "quota" | null {
  if (usableIds.has(persona.id)) return null;
  return personaReviewLock(persona) ?? "quota";
}

/** Raccourci booléen pour un persona précis. */
export function isPersonaUsable(
  personaId: string,
  personas: EligibilityPersona[],
  plan: string | null | undefined,
): boolean {
  return getUsablePersonaIds(personas, plan).has(personaId);
}
