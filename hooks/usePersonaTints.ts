"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  PERSONA_ASSIGNMENT_COLUMNS,
  PERSONA_GROUP_COLUMNS,
  normalizeGroupRow,
  personaTints,
  resolvePersonaGroups,
  type PersonaGroupAssignment,
  type PersonaGroupRow,
} from "@/lib/personaGroups";

const NONE: Record<string, string> = {};

/**
 * La teinte des personas d'un monde : la couleur de leur groupe principal
 * (migration 242) quand ce groupe l'applique, celle de son parent s'il n'en a pas (migration 232).
 * Même calcul que les salons (ChatRoomContent). Rien n'est lu tant que
 * `enabled` est faux.
 */
export function usePersonaTints(worldId: string | null, enabled: boolean): Record<string, string> {
  const supabase = useMemo(() => createClient(), []);
  const [loaded, setLoaded] = useState<{ worldId: string; tints: Record<string, string> } | null>(null);

  useEffect(() => {
    if (!worldId || !enabled) return;
    let cancelled = false;
    void Promise.all([
      supabase.from("world_persona_groups").select(PERSONA_GROUP_COLUMNS).eq("world_id", worldId),
      supabase.from("persona_group_assignments").select(PERSONA_ASSIGNMENT_COLUMNS).eq("world_id", worldId),
    ]).then(([{ data: groupRows }, { data: assignRows }]) => {
      if (cancelled) return;
      setLoaded({
        worldId,
        tints: personaTints(
          resolvePersonaGroups(((groupRows ?? []) as PersonaGroupRow[]).map(normalizeGroupRow)),
          (assignRows ?? []) as PersonaGroupAssignment[],
        ),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId, enabled]);

  return enabled && loaded && loaded.worldId === worldId ? loaded.tints : NONE;
}
