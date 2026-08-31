"use client";

import { useSyncExternalStore } from "react";

/**
 * Vrai quand la requête média est satisfaite.
 *
 * À n'employer que lorsqu'une classe Tailwind ne suffit pas — c'est-à-dire
 * quand il faut MONTER ou NON un composant, et pas seulement le cacher.
 *
 * Le cas qui l'a réclamé : la colonne latérale du wiki devient un tiroir sous
 * `xl`. La cacher en CSS laissait ses deux exemplaires montés en même temps,
 * chacun ouvrant un canal Realtime du même nom — ce que supabase-js refuse
 * franchement (« cannot add `postgres_changes` callbacks … after
 * `subscribe()` », voir `lib/realtimeChannel.ts`). Un panneau caché continuait
 * en outre d'interroger la base sur téléphone, pour rien.
 *
 * Rend `false` au rendu serveur, faute de fenêtre : l'appelant doit donc
 * survivre à un premier rendu « petit écran », corrigé à l'hydratation.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Points de rupture de Tailwind, pour ne pas les recopier à la main. */
export const MEDIA = {
  lg: "(min-width: 64rem)",
  xl: "(min-width: 80rem)",
} as const;
