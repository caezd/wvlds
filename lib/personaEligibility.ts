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

export type EligibilityPersona = {
  id: string;
  created_at: string;
  is_template?: boolean | null;
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

  if (plan && UNLIMITED_PLANS.has(plan)) {
    return new Set(candidates.map((p) => p.id));
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

  return new Set(eligible.map((p) => p.id));
}

/** Raccourci booléen pour un persona précis. */
export function isPersonaUsable(
  personaId: string,
  personas: EligibilityPersona[],
  plan: string | null | undefined,
): boolean {
  return getUsablePersonaIds(personas, plan).has(personaId);
}
