"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { LIVE_CHAT_OPTION_FIELDS, NO_LIVE_CHAT_OPTIONS, liveChatOptionsOf, type LiveChatOptions } from "@/lib/worldLiveChatOptions";

/**
 * Les options de la chatbox d'un monde (migration 241), lues à l'ouverture du
 * monde. Tant qu'elles ne sont pas lues, tout est éteint : rien ne s'affiche
 * qu'une option n'ait permis.
 */
export function useLiveChatOptions(worldId: string | null): LiveChatOptions {
  const supabase = useMemo(() => createClient(), []);
  const [loaded, setLoaded] = useState<{ worldId: string; options: LiveChatOptions } | null>(null);

  useEffect(() => {
    if (!worldId) return;
    let cancelled = false;
    void supabase
      .from(TABLE.WORLDS)
      .select(LIVE_CHAT_OPTION_FIELDS.join(", "))
      .eq("id", worldId)
      .maybeSingle()
      .then(({ data }: { data: unknown }) => {
        if (!cancelled) setLoaded({ worldId, options: liveChatOptionsOf(data as Parameters<typeof liveChatOptionsOf>[0]) });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId]);

  // Jamais les options d'un autre monde, le temps que celles-ci arrivent.
  return loaded && loaded.worldId === worldId ? loaded.options : NO_LIVE_CHAT_OPTIONS;
}
