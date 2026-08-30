"use client";

import { useSyncExternalStore } from "react";

/**
 * Store externe des compteurs de non-lus — lu par tranche, une clé à la fois.
 *
 * `NotificationsProvider` est monté à la racine et incrémente `roomUnread` à
 * **chaque INSERT de message dans tous vos mondes**. Comme la valeur de contexte
 * porte 18 champs de fréquences très différentes (`panelOpen`, `notifPrefs`,
 * `notifications`, `roomUnread`…), la moindre réception de message invalidait
 * l'ensemble et réveillait les 11 consommateurs — dont `ChatRoomView`, qui
 * n'utilise pourtant que deux callbacks stables.
 *
 * Deux réponses complémentaires :
 *  - ce store, pour les consommateurs qui ne suivent qu'une salle ou qu'un monde
 *    (`useRoomUnread` / `useWorldUnread`) ;
 *  - `useNotificationsActions()` (cf. NotificationsProvider), pour ceux qui ne
 *    veulent que les actions et aucun compteur.
 *
 * Les composants qui affichent une liste entière de salles continuent
 * légitimement de lire le `Record` complet via `useNotifications()`.
 */

const EMPTY: Record<string, number> = {};

let rooms: Record<string, number> = EMPTY;
let worlds: Record<string, number> = EMPTY;
const listeners = new Set<() => void>();

function notify(): void {
    for (const listener of listeners) listener();
}

function sameCounts(a: Record<string, number>, b: Record<string, number>): boolean {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && bKeys.every((k) => a[k] === b[k]);
}

/** Publie les compteurs courants. N'éveille les abonnés qu'en cas de changement réel. */
export function setUnreadCounts(
    nextRooms: Record<string, number>,
    nextWorlds: Record<string, number>,
): void {
    const roomsChanged = !sameCounts(rooms, nextRooms);
    const worldsChanged = !sameCounts(worlds, nextWorlds);
    if (!roomsChanged && !worldsChanged) return;
    if (roomsChanged) rooms = nextRooms;
    if (worldsChanged) worlds = nextWorlds;
    notify();
}

/** Remet le store à zéro (démontage du provider, déconnexion). */
export function resetUnreadCounts(): void {
    if (rooms === EMPTY && worlds === EMPTY) return;
    rooms = EMPTY;
    worlds = EMPTY;
    notify();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Exposé pour les tests. */
export function getUnreadCounts(): {
    rooms: Record<string, number>;
    worlds: Record<string, number>;
} {
    return { rooms, worlds };
}

/** Non-lus d'UNE salle. Ne re-rend que si ce compteur change. */
export function useRoomUnread(chatId?: string | null): number {
    return useSyncExternalStore(
        subscribe,
        () => (chatId ? (rooms[chatId] ?? 0) : 0),
        () => 0,
    );
}

/** Non-lus d'UN monde. Ne re-rend que si ce compteur change. */
export function useWorldUnread(worldId?: string | null): number {
    return useSyncExternalStore(
        subscribe,
        () => (worldId ? (worlds[worldId] ?? 0) : 0),
        () => 0,
    );
}
