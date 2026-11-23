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
 *
 * Un salon déclare aussi son id et son titre (migration 238) : la chatbox y
 * ouvre le fil de ce salon.
 */

export type LiveChatRoom = { id: string; title: string };
export type LiveChatContext = { worldId: string; chatroom: LiveChatRoom | null };

type Entry = { token: number; worldId: string; chatroom: LiveChatRoom | null };

let entries: Entry[] = [];
let nextToken = 1;
let snapshot: string | null = null;
let context: LiveChatContext | null = null;
let pending = false;
const listeners = new Set<() => void>();

function recompute() {
  pending = false;
  const top = entries.length ? entries[entries.length - 1] : null;
  const nextContext: LiveChatContext | null = top ? { worldId: top.worldId, chatroom: top.chatroom } : null;
  const same =
    (context === null && nextContext === null) ||
    (context !== null &&
      nextContext !== null &&
      context.worldId === nextContext.worldId &&
      context.chatroom?.id === nextContext.chatroom?.id &&
      context.chatroom?.title === nextContext.chatroom?.title);
  if (same) return;
  context = nextContext;
  snapshot = nextContext?.worldId ?? null;
  for (const l of listeners) l();
}

function schedule() {
  if (pending) return;
  pending = true;
  queueMicrotask(recompute);
}

/** Déclare le monde courant (et le salon, s'il y en a un) ; rend la fonction de retrait. */
export function registerLiveChatWorld(worldId: string, chatroom: LiveChatRoom | null = null): () => void {
  const token = nextToken++;
  entries = [...entries, { token, worldId, chatroom }];
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
const getContext = () => context;

/** Id du monde dont la barre de chat doit s'afficher, ou `null`. */
export function useLiveChatWorldId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Le monde et le salon courants, ou `null` hors d'un monde. */
export function useLiveChatContext(): LiveChatContext | null {
  return useSyncExternalStore(subscribe, getContext, getServerSnapshot);
}

/** Remise à zéro entre deux tests. */
export function __resetLiveChatWorlds() {
  entries = [];
  snapshot = null;
  context = null;
  pending = false;
  listeners.clear();
}
