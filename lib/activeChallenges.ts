import type { ActiveDailyChallenge } from "@/types/db";

/** Ligne renvoyée par la requête `challenges` avec les tentatives gagnées
 *  de l'utilisateur embarquées (`challenge_attempts(challenge_id)` filtré
 *  sur status=won + user_id côté PostgREST). */
export type DailyChallengeRow = {
  id: string;
  title: string;
  description: string | null;
  validation: unknown;
  reward_coins: number;
  reward_xp: number;
  min_word_count: number;
  source: string;
  active_date: string;
  challenge_attempts?: { challenge_id: string }[] | null;
};

/**
 * Transforme les lignes défis+tentatives embarquées en défis actifs.
 * Un défi est `already_won` si l'embed contient au moins une tentative —
 * l'embed étant filtré sur l'utilisateur courant, les victoires des autres
 * joueurs ne comptent pas.
 */
export function buildActiveChallenges(rows: DailyChallengeRow[]): {
  challenges: ActiveDailyChallenge[];
  wonIds: Set<string>;
} {
  const wonIds = new Set<string>(
    rows.filter((r) => (r.challenge_attempts?.length ?? 0) > 0).map((r) => r.id),
  );
  const challenges = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    validation: r.validation as ActiveDailyChallenge["validation"],
    reward_coins: r.reward_coins,
    reward_xp: r.reward_xp,
    min_word_count: r.min_word_count,
    active_date: r.active_date,
    source: r.source as ActiveDailyChallenge["source"],
    already_won: wonIds.has(r.id),
  }));
  return { challenges, wonIds };
}
