// lib/patreon/entitlement.ts
// Règle métier PURE : traduit un statut de mécénat Patreon en `plan` wvlds.
// Aucune I/O ici → 100 % testable unitairement.

import type { Plan } from "@/lib/userQuota";

export type PatronStatus = "active_patron" | "declined_patron" | "former_patron" | null;

/**
 * Détermine le plan à appliquer d'après le statut Patreon.
 *
 * Règles :
 *  - Un plan `lifetime` (accordé à vie, hors Patreon) n'est JAMAIS rétrogradé.
 *  - Sinon : `subscribed` si le mécène est actif ET son montant courant atteint
 *    le palier minimum (`minCents`) ; sinon `free`.
 *
 * @param currentPlan plan actuellement en base (pour préserver `lifetime`).
 */
export function resolvePlan(params: {
  patronStatus: PatronStatus;
  entitledCents: number;
  currentPlan: string | null;
  minCents: number;
}): Plan {
  const { patronStatus, entitledCents, currentPlan, minCents } = params;

  // Un abonnement à vie prime sur tout et n'est jamais retiré par Patreon.
  if (currentPlan === "lifetime") return "lifetime";

  const isActivePayingPatron =
    patronStatus === "active_patron" && entitledCents >= minCents;

  return isActivePayingPatron ? "subscribed" : "free";
}
