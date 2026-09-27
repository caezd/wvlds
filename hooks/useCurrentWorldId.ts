"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const WORLD_ROUTE = new RegExp(`^/w/(${UUID})(?:/|$)`);
const CHAT_ROUTE = new RegExp(`^/c/(${UUID})(?:/|$)`);

/**
 * Le monde où l'on se trouve, lu dans l'adresse : `/w/<id>` directement,
 * `/c/<id>` par le salon. Le profil d'un membre s'ouvre depuis n'importe où —
 * y compris hors du fournisseur d'appartenance, monté sous `/w/[id]` — et
 * l'adresse est le seul indice qu'il ait du monde courant.
 */
export function useCurrentWorldId(): string | null {
  const pathname = usePathname() ?? "";
  const supabase = useMemo(() => createClient(), []);
  const worldMatch = pathname.match(WORLD_ROUTE);
  const chatMatch = pathname.match(CHAT_ROUTE);
  const chatId = chatMatch?.[1] ?? null;
  const [chatWorld, setChatWorld] = useState<{ chatId: string; worldId: string | null } | null>(null);

  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from(TABLE.CHATROOMS).select("world_id").eq("id", chatId).maybeSingle();
      if (!cancelled) setChatWorld({ chatId, worldId: (data as { world_id: string | null } | null)?.world_id ?? null });
    })();
    return () => { cancelled = true; };
  }, [supabase, chatId]);

  if (worldMatch) return worldMatch[1];
  if (chatId && chatWorld?.chatId === chatId) return chatWorld.worldId;
  return null;
}
