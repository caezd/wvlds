"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { MEMBER_CARD_COLUMNS, type WorldMemberCardFields } from "@/lib/worldMembers";

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const WORLD_ROUTE = new RegExp(`^/w/(${UUID})(?:/|$)`);
const CHAT_ROUTE = new RegExp(`^/c/(${UUID})(?:/|$)`);

/**
 * Le monde où l'on se trouve, lu dans l'adresse : `/w/<id>` directement,
 * `/c/<id>` par le salon. La fiche « Mon profil » vit hors du fournisseur
 * d'appartenance (monté sous `/w/[id]`), l'adresse est ce qu'elle a.
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

/**
 * Ma carte dans le monde où l'on se trouve (présentation, disponibilités,
 * fuseau, anniversaire, statut), lue quand le monde change ; `null` hors d'un
 * monde ou si l'on n'en est pas membre.
 */
export function useMyWorldCard(userId: string): { worldId: string; card: WorldMemberCardFields; patch: (fields: WorldMemberCardFields) => void } | null {
  const supabase = useMemo(() => createClient(), []);
  const worldId = useCurrentWorldId();
  const [member, setMember] = useState<{ worldId: string; card: WorldMemberCardFields | null } | null>(null);

  useEffect(() => {
    if (!worldId) { setMember(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from(TABLE.WORLD_MEMBERS)
        .select(MEMBER_CARD_COLUMNS)
        .eq("world_id", worldId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled) setMember({ worldId, card: (data as WorldMemberCardFields | null) ?? null });
    })();
    return () => { cancelled = true; };
  }, [supabase, worldId, userId]);

  if (!worldId || member?.worldId !== worldId || !member.card) return null;
  const card = member.card;
  return { worldId, card, patch: (fields) => setMember({ worldId, card: { ...card, ...fields } }) };
}
