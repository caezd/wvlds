"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";

/**
 * Pseudos d'une liste de comptes, chargés une fois par id inconnu. Sert
 * l'ordre de passage, qui ne stocke que des ids.
 */
export function useProfileNames(ids: readonly string[]): Record<string, string> {
  const supabase = useMemo(() => createClient(), []);
  const [names, setNames] = useState<Record<string, string>>({});
  const manquants = ids.filter((id) => !(id in names));
  const cle = [...new Set(manquants)].sort().join(",");

  useEffect(() => {
    if (!cle) return;
    let annule = false;
    void (async () => {
      const { data } = await supabase.from(TABLE.PROFILES).select("id, username").in("id", cle.split(","));
      if (annule) return;
      const recus: Record<string, string> = {};
      for (const p of (data ?? []) as { id: string; username: string | null }[]) recus[p.id] = p.username ?? "?";
      // Un id sans profil lisible reste marqué, pour ne pas le redemander.
      for (const id of cle.split(",")) if (!(id in recus)) recus[id] = "?";
      setNames((prev) => ({ ...prev, ...recus }));
    })();
    return () => {
      annule = true;
    };
  }, [cle, supabase]);

  return names;
}
