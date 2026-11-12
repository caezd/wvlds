/**
 * Avis d'adhésion et de retrait d'un monde pour l'utilisateur courant.
 *
 * Ils arrivent sur son canal personnel privé (`msgs:<id>`, migration 208),
 * qu'ouvre `NotificationsProvider`. Un seul composant peut écouter un canal
 * d'un nom donné (cf. lib/realtimeChannel) : le provider relaie donc les avis
 * ici, et les autres (WorldMembershipGuard…) s'y abonnent.
 */
export type MembershipChange = { worldId: string; change: "added" | "removed" };

const listeners = new Set<(event: MembershipChange) => void>();

export function emitMembershipChange(event: MembershipChange): void {
  for (const l of listeners) l(event);
}

/** @returns la fonction de désabonnement */
export function onMembershipChange(listener: (event: MembershipChange) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
