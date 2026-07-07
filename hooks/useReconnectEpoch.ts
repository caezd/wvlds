"use client";

import { useEffect, useState } from "react";

// Après une vraie coupure réseau, la websocket Realtime de supabase-js peut
// rester "zombie" (ni ouverte ni fermée aux yeux du navigateur) bien après
// le retour d'internet : sa reconnexion interne dépend d'un heartbeat que les
// navigateurs throttlent en arrière-plan, ce qui la rend peu fiable en
// pratique. Plutôt que de bidouiller le socket bas niveau (au risque de
// vider les bindings des canaux), on force les effets qui créent des canaux
// Realtime à se démonter puis se remonter : ils retrouvent alors exactement
// le même chemin, testé, qu'au montage initial.
const HIDDEN_RECONNECT_THRESHOLD_MS = 15_000;

const listeners = new Set<() => void>();
let epoch = 0;

function bump() {
  epoch += 1;
  listeners.forEach((l) => l());
}

let wired = false;
function wireGlobalListeners() {
  if (wired || typeof window === "undefined") return;
  wired = true;

  window.addEventListener("online", bump);

  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt > HIDDEN_RECONNECT_THRESHOLD_MS) bump();
    hiddenAt = 0;
  });
}

/**
 * Incrémente à chaque retour de connexion réseau (ou réveil d'un onglet
 * resté caché longtemps). À inclure dans le tableau de dépendances d'un
 * effet qui crée un canal Realtime : l'effet se recrée alors proprement au
 * lieu de compter sur la reconnexion interne de la websocket.
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
