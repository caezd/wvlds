"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { WorldSidebarSkeleton } from "./WorldSidebarSkeleton";

/**
 * Monde dont la barre latérale des salons est actuellement rendue.
 *
 * Cette barre vit dans `app/(protected)/(world)/layout.tsx`, au-dessus de
 * `w/[id]` et de `c/[id]` : Next ne la refait pas quand on passe d'un salon à
 * l'autre, ni de l'accueil d'un monde à ses salons (ni requêtes serveur, ni
 * remontage, ni défilement perdu). La contrepartie : en arrivant sur un salon
 * ou un monde AUTRE (notification, recherche, sélecteur de monde…), elle
 * montrerait encore l'ancien. `SidebarWorldGuard` le détecte et rafraîchit ;
 * en attendant, `SidebarWorldSlot` remplace la barre périmée par son squelette,
 * pour qu'on ne clique pas dans la liste de salons d'un autre monde.
 */
type Value = { worldId: string | null; masked: boolean; mask: () => void };
const SidebarWorldContext = createContext<Value | undefined>(undefined);

/** Au-delà, on rend la barre même si le rafraîchissement n'a rien changé. */
const MASK_MAX_MS = 4000;

export function SidebarWorldProvider({ worldId, children }: { worldId: string | null; children: ReactNode }) {
  // Monde dont la barre est masquée. Le masque tombe de lui-même dès que le
  // layout se refait pour un autre monde : `worldId` ne vaut plus `maskedFor`.
  const [maskedFor, setMaskedFor] = useState<string | null | undefined>(undefined);
  const mask = useCallback(() => setMaskedFor(worldId), [worldId]);
  const masked = maskedFor !== undefined && maskedFor === worldId;

  useEffect(() => {
    if (!masked) return;
    const t = setTimeout(() => setMaskedFor(undefined), MASK_MAX_MS);
    return () => clearTimeout(t);
  }, [masked]);

  const value = useMemo(() => ({ worldId, masked, mask }), [worldId, masked, mask]);
  return <SidebarWorldContext.Provider value={value}>{children}</SidebarWorldContext.Provider>;
}

/** Emplacement de la barre : son squelette tant qu'elle montre un autre monde que la page. */
export function SidebarWorldSlot({ children }: { children: ReactNode }) {
  const ctx = useContext(SidebarWorldContext);
  return ctx?.masked ? <WorldSidebarSkeleton /> : <>{children}</>;
}

/**
 * Rendu par le salon et par la page de monde : si la barre latérale montre un
 * autre monde que le leur,
 * rafraîchit la route — le layout parent se refait alors pour le bon monde.
 * Une seule tentative par salon monté, pour ne jamais boucler.
 */
export function SidebarWorldGuard({ worldId }: { worldId: string | null }) {
  const ctx = useContext(SidebarWorldContext);
  const sidebarWorldId = ctx?.worldId;
  const mask = ctx?.mask;
  const router = useRouter();
  const tente = useRef(false);

  useEffect(() => {
    if (sidebarWorldId === undefined || !mask) return; // hors du layout des mondes
    if (sidebarWorldId === worldId || tente.current) return;
    tente.current = true;
    // Rien à masquer quand aucune barre n'est affichée.
    if (sidebarWorldId !== null) mask();
    router.refresh();
  }, [sidebarWorldId, worldId, mask, router]);

  return null;
}
