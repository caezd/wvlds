"use client";

import { useSyncExternalStore } from "react";
import { PRESENCE } from "@/lib/constants";

/**
 * Store externe de la présence globale — lu par tranche, un utilisateur à la fois.
 *
 * `PresenceProvider` est monté à la racine et son `onlineUsers` change à chaque
 * `sync`/`join` du canal, plus toutes les 30 s (`PRESENCE.REFRESH_MS`). Tout
 * consommateur de `useGlobalPresence()` se re-rendait alors, quel que soit
 * l'utilisateur concerné : dans un salon, les ~50 bulles affichées se
 * re-rendaient ensemble à chaque battement de présence de n'importe qui, dans
 * n'importe quel monde. `memo()` n'y peut rien — une invalidation de contexte
 * traverse `React.memo`.
 *
 * Ici, les statuts sont **dérivés à l'écriture** (pas à la lecture) et rangés
 * dans un simple `Record`. `useUserPresence(uid)` lit une seule clé via
 * `useSyncExternalStore` : à chaque notification, React compare la chaîne
 * renvoyée et n'effectue le rendu que si le statut de CET utilisateur a changé.
 *
 * Pourquoi pas zustand : le besoin se réduit à « un Record + des sélecteurs par
 * clé », ce que `useSyncExternalStore` (natif React 18+) couvre en une trentaine
 * de lignes. Pas de dépendance supplémentaire pour ça.
 */

export type GlobalPresenceMeta = {
    user_id: string;
    username?: string | null;
    avatar_url?: string | null;
    last_active_at?: string | null;
};

export type UserPresence = "online" | "away" | "offline";

/** Statut fin-grain déduit de la dernière activité connue. */
export function derivePresenceStatus(meta?: GlobalPresenceMeta | null): UserPresence {
    if (!meta?.last_active_at) return "offline";
    const elapsed = Date.now() - Date.parse(meta.last_active_at);
    if (!Number.isFinite(elapsed)) return "offline";
    if (elapsed < PRESENCE.AWAY_WINDOW_MS) return "online";
    if (elapsed < PRESENCE.OFFLINE_WINDOW_MS) return "away";
    return "offline";
}

const EMPTY: Record<string, UserPresence> = {};

let statuses: Record<string, UserPresence> = EMPTY;
const listeners = new Set<() => void>();

/**
 * Remplace l'instantané des statuts. Appelé par `PresenceProvider` à chaque
 * recalcul. Ne notifie que si au moins un statut a réellement changé — un
 * battement qui ne déplace personne ne réveille aucun abonné.
 */
export function setPresenceStatuses(metas: Record<string, GlobalPresenceMeta>): void {
    const next: Record<string, UserPresence> = {};
    for (const [uid, meta] of Object.entries(metas)) {
        const status = derivePresenceStatus(meta);
        // "offline" est la valeur par défaut à la lecture : inutile de la stocker.
        if (status !== "offline") next[uid] = status;
    }

    const prevKeys = Object.keys(statuses);
    const nextKeys = Object.keys(next);
    const unchanged =
        prevKeys.length === nextKeys.length &&
        nextKeys.every((k) => statuses[k] === next[k]);
    if (unchanged) return;

    statuses = next;
    for (const listener of listeners) listener();
}

/** Remet le store à zéro (démontage du provider, déconnexion). */
export function resetPresenceStatuses(): void {
    if (statuses === EMPTY) return;
    statuses = EMPTY;
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Exposé pour les tests. */
export function getPresenceStatuses(): Record<string, UserPresence> {
    return statuses;
}

/**
 * Statut d'UN utilisateur. Le composant n'est re-rendu que si ce statut change,
 * pas à chaque mouvement de présence dans l'application.
 */
export function useUserPresence(userId?: string | null): UserPresence {
    return useSyncExternalStore(
        subscribe,
        () => (userId ? (statuses[userId] ?? "offline") : "offline"),
        () => "offline" as UserPresence,
    );
}
