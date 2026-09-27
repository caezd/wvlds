"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";

// Ce que le monde dit des faceclaims : s'en sert-il, et les exige-t-il
// (migration 191) ? Une valeur par monde, mémorisée pour la session — la
// fiche d'un persona la demande à deux endroits, l'éditeur pour montrer ou
// non le champ, la barre de validation pour savoir s'il manque.
export type FaceclaimRule = { enabled: boolean; required: boolean };

const cache = new Map<string, FaceclaimRule>();
const pending = new Map<string, Promise<FaceclaimRule>>();

const HORS_MONDE: FaceclaimRule = { enabled: true, required: false };

async function fetchRule(worldId: string): Promise<FaceclaimRule> {
  const cached = cache.get(worldId);
  if (cached) return cached;
  const inFlight = pending.get(worldId);
  if (inFlight) return inFlight;
  const promise = createClient()
    .from(TABLE.WORLDS)
    .select("enable_faceclaims, require_faceclaim")
    .eq("id", worldId)
    .maybeSingle()
    .then(({ data, error }: { data: unknown; error: unknown }) => {
      const row = data as { enable_faceclaims: boolean | null; require_faceclaim: boolean | null } | null;
      // Monde illisible : on n'invente pas d'exigence, et le champ reste offert.
      const rule: FaceclaimRule = error || !row
        ? HORS_MONDE
        : { enabled: row.enable_faceclaims !== false, required: !!row.require_faceclaim };
      if (!error && row) cache.set(worldId, rule);
      return rule;
    })
    .finally(() => pending.delete(worldId));
  pending.set(worldId, promise);
  return promise;
}

/** Après un réglage : la valeur connue pour ce monde, sans nouvel appel. */
export function setWorldFaceclaimRuleCache(worldId: string, rule: FaceclaimRule) {
  cache.set(worldId, rule);
}

/** Pour les tests : oublie tout. */
export function resetWorldFaceclaimRuleCache() {
  cache.clear();
  pending.clear();
}

/**
 * La règle du monde, `null` pendant le chargement. Hors monde : les
 * faceclaims restent offerts et personne ne les exige.
 */
export function useWorldFaceclaimRule(worldId: string | null | undefined): FaceclaimRule | null {
  const initial = useMemo(() => (worldId ? cache.get(worldId) ?? null : HORS_MONDE), [worldId]);
  const [rule, setRule] = useState<FaceclaimRule | null>(initial);
  useEffect(() => {
    if (!worldId) { setRule(HORS_MONDE); return; }
    const cached = cache.get(worldId);
    if (cached) { setRule(cached); return; }
    let cancelled = false;
    setRule(null);
    void fetchRule(worldId).then((v) => { if (!cancelled) setRule(v); });
    return () => { cancelled = true; };
  }, [worldId]);
  return rule;
}
