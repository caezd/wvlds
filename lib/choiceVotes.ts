// Logique pure d'agrégation des votes d'un bloc "choice", extraite pour être
// testable indépendamment de Supabase/React.

import type { ChoiceVoteSummary } from "@/types/db";

/** Agrège des lignes de vote brutes (une par utilisateur) en résumé par option. */
export function aggregateChoiceVotes(
  rows: { option_id: string; user_id: string }[],
  viewerId: string | null,
): ChoiceVoteSummary[] {
  const byOption = new Map<string, { count: number; mine: boolean }>();
  for (const r of rows) {
    const prev = byOption.get(r.option_id) ?? { count: 0, mine: false };
    byOption.set(r.option_id, { count: prev.count + 1, mine: prev.mine || r.user_id === viewerId });
  }
  return Array.from(byOption.entries()).map(([option_id, v]) => ({ option_id, ...v }));
}

/**
 * Met à jour localement le résumé après un vote optimiste de l'utilisateur
 * courant (déplace son vote précédent, le cas échéant, vers la nouvelle option).
 */
export function applyOwnVote(current: ChoiceVoteSummary[], nextOptionId: string): ChoiceVoteSummary[] {
  const prevMine = current.find((v) => v.mine);
  if (prevMine?.option_id === nextOptionId) return current;

  let next = current
    .map((v) => (v.mine ? { ...v, count: v.count - 1, mine: false } : v))
    .filter((v) => v.count > 0);

  const existing = next.find((v) => v.option_id === nextOptionId);
  next = existing
    ? next.map((v) => (v.option_id === nextOptionId ? { ...v, count: v.count + 1, mine: true } : v))
    : [...next, { option_id: nextOptionId, count: 1, mine: true }];

  return next;
}

/**
 * Applique un évènement Realtime de vote d'un tiers (INSERT/UPDATE/DELETE sur
 * chat_choice_votes) au résumé local. `prevOptionId`/`nextOptionId` sont
 * `null` en l'absence de vote antérieur/nouveau (insertion / suppression).
 */
export function applyRemoteVoteChange(
  current: ChoiceVoteSummary[],
  prevOptionId: string | null,
  nextOptionId: string | null,
): ChoiceVoteSummary[] {
  let next = current;
  if (prevOptionId) {
    next = next
      .map((v) => (v.option_id === prevOptionId ? { ...v, count: v.count - 1 } : v))
      .filter((v) => v.count > 0);
  }
  if (nextOptionId) {
    const existing = next.find((v) => v.option_id === nextOptionId);
    next = existing
      ? next.map((v) => (v.option_id === nextOptionId ? { ...v, count: v.count + 1 } : v))
      : [...next, { option_id: nextOptionId, count: 1, mine: false }];
  }
  return next;
}
