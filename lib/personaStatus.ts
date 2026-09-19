import type { PersonaNarrativeStatus } from "@/types/db";

/**
 * Le statut narratif d'un persona (migration 180) : vivant, disparu, décédé,
 * retiré. Il ne défend rien — un mort parle encore dans un souvenir — mais se
 * voit partout où le persona paraît.
 */
export const NARRATIVE_STATUSES: readonly PersonaNarrativeStatus[] = ["alive", "missing", "dead", "retired"];

export function isNarrativeStatus(value: unknown): value is PersonaNarrativeStatus {
  return typeof value === "string" && (NARRATIVE_STATUSES as readonly string[]).includes(value);
}

/** Décédé ou retiré : le persona a quitté la scène, on le grise. */
export function isRetiredStatus(status: PersonaNarrativeStatus | null | undefined): boolean {
  return status === "dead" || status === "retired";
}

/** Le statut à afficher, `alive` par défaut pour les lignes qui n'en portent pas. */
export function narrativeStatusOf(value: unknown): PersonaNarrativeStatus {
  return isNarrativeStatus(value) ? value : "alive";
}
