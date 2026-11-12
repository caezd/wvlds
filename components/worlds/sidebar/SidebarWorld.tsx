"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Monde dont la barre latérale des salons est actuellement rendue.
 *
 * Cette barre vit dans `app/(protected)/c/layout.tsx`, au-dessus du segment
 * `[id]` : Next ne la refait pas quand on passe d'un salon à l'autre (ni
 * requêtes serveur, ni remontage, ni défilement perdu). La contrepartie : en
 * arrivant sur un salon d'un AUTRE monde (notification, recherche…), elle
 * montrerait encore l'ancien. `SidebarWorldGuard` le détecte et rafraîchit.
 */
const SidebarWorldContext = createContext<string | null | undefined>(undefined);

export function SidebarWorldProvider({ worldId, children }: { worldId: string | null; children: ReactNode }) {
  return <SidebarWorldContext.Provider value={worldId}>{children}</SidebarWorldContext.Provider>;
}

/**
 * Rendu par le salon : si la barre latérale montre un autre monde que le sien,
 * rafraîchit la route — le layout parent se refait alors pour le bon monde.
 * Une seule tentative par salon monté, pour ne jamais boucler.
 */
export function SidebarWorldGuard({ worldId }: { worldId: string | null }) {
  const sidebarWorldId = useContext(SidebarWorldContext);
  const router = useRouter();
  const tente = useRef(false);

  useEffect(() => {
    if (sidebarWorldId === undefined) return; // hors du layout des salons
    if (sidebarWorldId === worldId || tente.current) return;
    tente.current = true;
    router.refresh();
  }, [sidebarWorldId, worldId, router]);

  return null;
}
