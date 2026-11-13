"use client";

import { useEffect, useState } from "react";

/**
 * Un persona créé, modifié ou supprimé depuis un tiroir. Les listes qui
 * chargent leurs personas côté client (page Membres, étagères des Personas)
 * ne sont pas touchées par `router.refresh()`, qui ne rejoue que le rendu
 * serveur : elles écoutent ce signal pour se recharger.
 */
const PERSONAS_CHANGED = "wvlds:personas-changed";

export function notifyPersonasChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PERSONAS_CHANGED));
}

/** Un compteur qui avance à chaque signal : à mettre dans les dépendances d'un chargement. */
export function usePersonasChangedVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(PERSONAS_CHANGED, bump);
    return () => window.removeEventListener(PERSONAS_CHANGED, bump);
  }, []);
  return version;
}
