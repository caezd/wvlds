"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { openRealtimeChannel } from "@/lib/realtimeChannel";
import { TABLE } from "@/lib/constants";

export type LiveChatAuthor = { username: string | null; avatar_url: string | null };

export type LiveChatMessage = {
  id: string;
  world_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author: LiveChatAuthor | null;
};

type Row = Omit<LiveChatMessage, "author"> & { profiles?: LiveChatAuthor | LiveChatAuthor[] | null };

/** Messages chargés à l'ouverture ; la base en garde 500 par monde (migration 202). */
export const LIVE_CHAT_PAGE = 50;
/** Messages gardés en mémoire : au-delà, les plus anciens sortent du fil. */
const LIVE_CHAT_MEMORY = 200;

const SELECT = "id, world_id, user_id, content, created_at, profiles(username, avatar_url)";

function toMessage(row: Row): LiveChatMessage {
  const { profiles, ...rest } = row;
  const author = Array.isArray(profiles) ? (profiles[0] ?? null) : (profiles ?? null);
  return { ...rest, author };
}

/** Insère un message à sa place chronologique, sans doublon. */
export function mergeMessage(list: LiveChatMessage[], msg: LiveChatMessage): LiveChatMessage[] {
  if (list.some((m) => m.id === msg.id)) return list;
  const next = [...list, msg].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return next.length > LIVE_CHAT_MEMORY ? next.slice(next.length - LIVE_CHAT_MEMORY) : next;
}

export type SendResult = "ok" | "too_fast" | "error";

/**
 * Chat en direct d'un monde : derniers messages, flux temps réel et nombre de
 * membres présents. Un seul canal par monde (`world-live:<id>`) porte à la
 * fois les `postgres_changes` de `world_live_messages` et la présence — son
 * nom est le point de rendez-vous de la présence, il reste donc stable (cf.
 * lib/realtimeChannel.ts).
 *
 * `worldId` nul : rien n'est chargé ni ouvert.
 */
export function useWorldLiveChat(worldId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const { userId, username, avatarUrl } = useCurrentUser();
  const { appearOffline } = useGlobalPresence();
  const reconnectEpoch = useReconnectEpoch();

  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [presentCount, setPresentCount] = useState(0);

  // Auteurs déjà connus : un INSERT temps réel n'apporte que `user_id`.
  const authorsRef = useRef(new Map<string, LiveChatAuthor>());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const appearOfflineRef = useRef(appearOffline);

  useEffect(() => {
    if (userId) authorsRef.current.set(userId, { username, avatar_url: avatarUrl });
  }, [userId, username, avatarUrl]);

  const resolveAuthor = useCallback(
    async (msg: LiveChatMessage): Promise<LiveChatMessage> => {
      if (msg.author) return msg;
      const known = authorsRef.current.get(msg.user_id);
      if (known) return { ...msg, author: known };
      const { data } = await supabase
        .from(TABLE.PROFILES)
        .select("username, avatar_url")
        .eq("id", msg.user_id)
        .maybeSingle();
      const author = (data as LiveChatAuthor | null) ?? null;
      if (author) authorsRef.current.set(msg.user_id, author);
      return { ...msg, author };
    },
    [supabase],
  );

  // Changer de monde vide le fil : jamais un message d'un autre monde affiché.
  useEffect(() => {
    setMessages([]);
    setPresentCount(0);
  }, [worldId]);

  // Chargement initial, puis à chaque reconnexion (messages manqués hors ligne).
  useEffect(() => {
    if (!worldId || !userId) return;
    let cancelled = false;
    setLoading(true);
    async function load() {
      const { data } = await supabase
        .from(TABLE.WORLD_LIVE_MESSAGES)
        .select(SELECT)
        .eq("world_id", worldId)
        .order("created_at", { ascending: false })
        .limit(LIVE_CHAT_PAGE);
      if (cancelled) return;
      const rows = ((data ?? []) as Row[]).map(toMessage).reverse();
      for (const m of rows) if (m.author) authorsRef.current.set(m.user_id, m.author);
      setMessages((prev) => rows.reduce(mergeMessage, prev.filter((m) => m.world_id === worldId)));
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId, userId, reconnectEpoch]);

  // Flux temps réel + présence.
  useEffect(() => {
    if (!worldId || !userId) return;

    const close = openRealtimeChannel(
      supabase,
      `world-live:${worldId}`,
      (channel) => {
        channel
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: TABLE.WORLD_LIVE_MESSAGES, filter: `world_id=eq.${worldId}` },
            (payload: { new: Record<string, unknown> }) => {
              const msg = toMessage(payload.new as Row);
              void resolveAuthor(msg).then((full) => setMessages((prev) => mergeMessage(prev, full)));
            },
          )
          // Les DELETE ne se filtrent pas côté Realtime : seul l'id compte.
          .on(
            "postgres_changes",
            { event: "DELETE", schema: "public", table: TABLE.WORLD_LIVE_MESSAGES },
            (payload: { old: Record<string, unknown> }) => {
              const id = (payload.old as { id?: string }).id;
              if (id) setMessages((prev) => prev.filter((m) => m.id !== id));
            },
          )
          .on("presence", { event: "sync" }, () => {
            setPresentCount(Object.keys(channel.presenceState()).length);
          });

        channel.subscribe(async (status: string) => {
          if (status !== "SUBSCRIBED") return;
          // Mode invisible : on lit sans se compter parmi les présents.
          if (!appearOfflineRef.current) await channel.track({ user_id: userId });
          setPresentCount(Object.keys(channel.presenceState()).length);
        });
        channelRef.current = channel;
        return channel;
      },
      { config: { presence: { key: userId } } },
    );

    return () => {
      channelRef.current?.untrack();
      channelRef.current = null;
      close();
    };
  }, [supabase, worldId, userId, reconnectEpoch, resolveAuthor]);

  // Passer en invisible (ou en revenir) sans rouvrir le canal. Seul un
  // CHANGEMENT agit : au montage, c'est l'abonnement qui décide de `track`.
  useEffect(() => {
    if (appearOfflineRef.current === appearOffline) return;
    appearOfflineRef.current = appearOffline;
    const ch = channelRef.current;
    if (!ch || !userId) return;
    if (appearOffline) void ch.untrack();
    else void ch.track({ user_id: userId });
  }, [appearOffline, userId]);

  const send = useCallback(
    async (raw: string): Promise<SendResult> => {
      const content = raw.trim();
      if (!worldId || !userId || !content) return "error";
      const { data, error } = await supabase
        .from(TABLE.WORLD_LIVE_MESSAGES)
        .insert({ world_id: worldId, user_id: userId, content })
        .select(SELECT)
        .single();
      if (error || !data) {
        return error?.message?.includes("Trop de messages") ? "too_fast" : "error";
      }
      setMessages((prev) => mergeMessage(prev, toMessage(data as Row)));
      return "ok";
    },
    [supabase, worldId, userId],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const { error } = await supabase.from(TABLE.WORLD_LIVE_MESSAGES).delete().eq("id", id);
      if (error) return false;
      setMessages((prev) => prev.filter((m) => m.id !== id));
      return true;
    },
    [supabase],
  );

  return { messages, loading, presentCount, send, remove, userId };
}
