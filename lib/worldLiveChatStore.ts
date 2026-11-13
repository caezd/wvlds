"use client";

import { useSyncExternalStore } from "react";

/**
 * Monde dont le chat en direct est affiché au bas de l'application.
 *
 * La barre vit dans `AppShell`, qui reste monté d'une page à l'autre : passer
 * de l'accueil d'un monde à l'un de ses salons ne referme donc ni le panneau
 * ni le canal de présence. Mais `AppShell` ne sait pas dans quel monde on se
 * trouve — un salon (`/c/[id]`) ne porte pas l'id de son monde dans l'URL. Ce
 * sont donc les layouts de monde et de salon qui le déclarent, en montant
 * `WorldLiveChatAnchor`.
 *
 * Le dernier inscrit l'emporte. Le retrait est notifié à la microtâche
 * suivante : lors d'une navigation monde → salon du même monde, l'ancien
 * layout se démonte puis le nouveau s'inscrit dans le même passage d'effets ;
 * les abonnés ne voient alors que l'état final, sans passage par « aucun
 * monde » qui fermerait le canal pour le rouvrir aussitôt.
 */

type Entry = { token: number; worldId: string };

let entries: Entry[] = [];
let nextToken = 1;
let snapshot: string | null = null;
let pending = false;
const listeners = new Set<() => void>();

function recompute() {
  pending = false;
  const next = entries.length ? entries[entries.length - 1].worldId : null;
  if (next === snapshot) return;
  snapshot = next;
  for (const l of listeners) l();
}

function schedule() {
  if (pending) return;
  pending = true;
  queueMicrotask(recompute);
}

/** Déclare le monde courant ; rend la fonction de retrait. */
export function registerLiveChatWorld(worldId: string): () => void {
  const token = nextToken++;
  entries = [...entries, { token, worldId }];
  schedule();
  return () => {
    entries = entries.filter((e) => e.token !== token);
    schedule();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => null;

/** Id du monde dont la barre de chat doit s'afficher, ou `null`. */
export function useLiveChatWorldId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Remise à zéro entre deux tests. */
export function __resetLiveChatWorlds() {
  entries = [];
  snapshot = null;
  pending = false;
  listeners.clear();
}
