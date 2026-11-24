"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { topic, useTopic } from "@/lib/realtimeHub";
import { fetchLiveChannels, sortChannels, type LiveChannel } from "@/lib/worldLiveChannels";

/**
 * Les salles de la chatbox d'un monde, tenues à jour : avis `live_channels`
 * du canal du monde (migration 238), relecture au retour d'une coupure.
 * Une salle réservée à un groupe (migration 243) s'annonce sans sa ligne :
 * la liste se relit alors, avec nos droits. `null` tant qu'elles ne sont pas
 * chargées.
 */
export function useLiveChannels(worldId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [channels, setChannels] = useState<LiveChannel[] | null>(null);

  const load = useCallback(async () => {
    if (!worldId) return;
    setChannels(await fetchLiveChannels(supabase as never, worldId));
  }, [supabase, worldId]);

  useEffect(() => {
    setChannels(null);
    void load();
  }, [load]);

  useTopic(worldId ? topic.world(worldId) : null, ({ event, payload }) => {
    if (event !== "live_channels") return;
    const avis = payload as { op?: string; id?: string; record?: LiveChannel };
    if (avis.op !== "DELETE" && !avis.record) {
      void load();
      return;
    }
    setChannels((prev) => {
      if (!prev) return prev;
      if (avis.op === "DELETE" && avis.id) return prev.filter((c) => c.id !== avis.id);
      if (avis.record) {
        const rec = avis.record;
        return sortChannels([...prev.filter((c) => c.id !== rec.id), rec]);
      }
      return prev;
    });
  }, { onResync: () => void load() });

  return { channels, setChannels, reload: load };
}
