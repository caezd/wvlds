"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { RPC } from "@/lib/constants";

// Le monde relit-il ses fiches de persona (migration 184 :
// `persona_review_enabled` ET une fiche par défaut) ? Une valeur par monde,
// mémorisée pour la session : les tuiles, le sélecteur du salon et la fiche
// la demandent tous, souvent en même temps.
const cache = new Map<string, boolean>();
const pending = new Map<string, Promise<boolean>>();

async function fetchWorldReviewActive(worldId: string): Promise<boolean> {
  const cached = cache.get(worldId);
  if (cached !== undefined) return cached;
  const inFlight = pending.get(worldId);
  if (inFlight) return inFlight;
  const supabase = createClient();
  const promise = supabase
    .rpc(RPC.WORLD_PERSONA_REVIEW_ACTIVE, { p_world_id: worldId })
    .then(({ data, error }: { data: boolean | null; error: unknown }) => {
      const value = !error && data === true;
      if (!error) cache.set(worldId, value);
      return value;
    })
    .finally(() => pending.delete(worldId));
  pending.set(worldId, promise);
  return promise;
}

/** Après un réglage : la valeur connue pour ce monde, sans nouvel appel. */
export function setWorldReviewActiveCache(worldId: string, value: boolean) {
  cache.set(worldId, value);
}

/** Pour les tests : oublie tout. */
export function resetWorldReviewActiveCache() {
  cache.clear();
  pending.clear();
}

/**
 * `true`/`false` une fois connu, `null` pendant le chargement ; `false` sans
 * monde (un persona hors monde n'est relu par personne).
 */
export function useWorldReviewActive(worldId: string | null | undefined): boolean | null {
  const initial = useMemo(() => (worldId ? cache.get(worldId) ?? null : false), [worldId]);
  const [active, setActive] = useState<boolean | null>(initial);
  useEffect(() => {
    if (!worldId) { setActive(false); return; }
    const cached = cache.get(worldId);
    if (cached !== undefined) { setActive(cached); return; }
    let cancelled = false;
    setActive(null);
    void fetchWorldReviewActive(worldId).then((v) => { if (!cancelled) setActive(v); });
    return () => { cancelled = true; };
  }, [worldId]);
  return active;
}
