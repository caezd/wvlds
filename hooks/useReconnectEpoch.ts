"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Après une vraie coupure réseau, ou un long séjour en arrière-plan (PWA
// réduite, onglet gelé), la websocket Realtime de supabase-js est souvent
// « zombie » : ouverte aux yeux du navigateur, morte côté réseau. Elle accepte
// encore les envois, donc `isConnected()` répond vrai et rien ne la remet en
// cause avant que le heartbeat ne l'abandonne — 25 s d'intervalle plus 25 s
// d'attente, soit près d'une minute pendant laquelle tout canal rejoint dans
// le vide (mesuré : 52 s sur un banc d'essai, cf. lib/__tests__/realtimeResume).
//
// On ne fait donc plus confiance à la socket au réveil : on la ferme
// explicitement, puis on force les effets qui créent des canaux Realtime à se
// démonter et se remonter. Ils retrouvent alors exactement le même chemin,
// testé, qu'au montage initial — sur une socket neuve.
const HIDDEN_RECONNECT_THRESHOLD_MS = 15_000;
/** Délai maximal accordé à la fermeture effective de l'ancienne socket. */
const SOCKET_CLOSE_TIMEOUT_MS = 3_000;

const listeners = new Set<() => void>();
let epoch = 0;

function bump() {
  epoch += 1;
  listeners.forEach((l) => l());
}

type RealtimeLike = {
  disconnect?: () => Promise<unknown>;
  connectionState?: () => string;
};

async function closeRealtimeSocket() {
  const realtime = (createClient() as { realtime?: RealtimeLike }).realtime;
  if (!realtime?.disconnect) return;
  await realtime.disconnect();
  // `disconnect()` rend la main aussitôt si une fermeture est déjà en cours.
  // Or `connect()` refuse d'ouvrir tant que l'ancienne socket se ferme : un
  // canal créé à ce moment-là mettrait son join en attente sans que personne
  // ne vienne le relancer. On patiente donc jusqu'à la fermeture effective.
  if (!realtime.connectionState) return;
  const limite = Date.now() + SOCKET_CLOSE_TIMEOUT_MS;
  while (realtime.connectionState() !== "closed" && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

let reconnexionEnCours: Promise<void> | null = null;

/**
 * Ferme la socket Realtime puis incrémente l'epoch. Les signaux de réveil
 * arrivent souvent groupés (`online` et `visibilitychange` dans la même
 * seconde) : un seul cycle est mené, les suivants s'y rattachent.
 */
function reconnect(): Promise<void> {
  if (reconnexionEnCours) return reconnexionEnCours;
  reconnexionEnCours = (async () => {
    try {
      await closeRealtimeSocket();
    } catch {
      // Quoi qu'il arrive à la socket, les canaux sont recréés : leur
      // `subscribe()` rouvre la connexion de lui-même.
    }
    reconnexionEnCours = null;
    bump();
  })();
  return reconnexionEnCours;
}

let wired = false;
function wireGlobalListeners() {
  if (wired || typeof window === "undefined") return;
  wired = true;

  window.addEventListener("online", () => void reconnect());

  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt > HIDDEN_RECONNECT_THRESHOLD_MS) void reconnect();
    hiddenAt = 0;
  });
}

/**
 * Incrémente à chaque retour de connexion réseau (ou réveil d'un onglet
 * resté caché longtemps), une fois la socket Realtime refermée. À inclure
 * dans le tableau de dépendances d'un effet qui crée un canal Realtime :
 * l'effet se recrée alors proprement, sur une connexion neuve, au lieu de
 * compter sur la reconnexion interne de la websocket.
 */
export function useReconnectEpoch() {
  wireGlobalListeners();
  const [value, setValue] = useState(epoch);
  useEffect(() => {
    const listener = () => setValue(epoch);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}
