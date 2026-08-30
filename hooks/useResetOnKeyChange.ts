"use client";

import { useRef } from "react";

/**
 * Rejoue `seed` quand `key` change — jamais au montage.
 *
 * À quoi ça sert : naviguer entre deux valeurs d'un même segment dynamique
 * (`/c/A` → `/c/B`, `/w/A` → `/w/B`) ne remonte pas les composants. Même type
 * d'élément, même position dans l'arbre, aucun `key` : React les réconcilie et
 * Next se contente de leur passer de nouveaux props. Tout `useState(initialX)`
 * garde donc la valeur de la page précédente, l'initialiseur d'un `useState`
 * ne s'exécutant qu'au montage.
 *
 * Pourquoi pas un `useEffect([key])` : un effet s'exécute APRÈS la peinture.
 * Le temps d'une image, l'utilisateur voit encore les données de la page
 * quittée. Une mise à jour d'état pendant le rendu, elle, fait recommencer le
 * rendu immédiatement — React ne peint que le résultat final. C'est le motif
 * que React recommande explicitement pour ajuster un état quand un prop change.
 * Il évite en prime la directive `eslint-disable` qu'imposait la version en
 * effet (`initialX` ne peut pas figurer dans les dépendances, sous peine de
 * resemer à chaque rendu serveur et d'écraser les mises à jour Realtime).
 *
 * ```ts
 * useResetOnKeyChange(worldId, () => {
 *   setRooms(initialRooms);
 * });
 * ```
 */
export function useResetOnKeyChange(key: string, seed: () => void): void {
  const previous = useRef(key);
  if (previous.current !== key) {
    previous.current = key;
    seed();
  }
}
