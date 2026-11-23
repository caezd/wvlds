"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { openRealtimeChannel } from "@/lib/realtimeChannel";
import { TABLE } from "@/lib/constants";
import { topic, useTopic } from "@/lib/realtimeHub";
import { MAIN_PLACE, placeColumns, placeKey, placeOf, type LiveChatPlace } from "@/lib/worldLiveChannels";

export type LiveChatAuthor = { username: string | null; avatar_url: string | null };

/** Le message auquel on répond, en bref ; `null` s'il a été supprimé. */
export type LiveChatReply = { id: string; content: string; user_id: string; username: string | null };

export type LiveChatMessage = {
  id: string;
  world_id: string;
  user_id: string;
  content: string;
  created_at: string;
  /** Salle personnalisée, fil d'un salon (migration 238) ; nuls : salle principale. */
  channel_id?: string | null;
  chatroom_id?: string | null;
  reply_to_id?: string | null;
  /** Le message cité : connu, ou `null` (supprimé, ou hors de portée). */
  reply?: LiveChatReply | null;
  author: LiveChatAuthor | null;
};

type ReplyRow = { id: string; content: string; user_id: string; profiles?: { username: string | null } | { username: string | null }[] | null };
type Row = Omit<LiveChatMessage, "author" | "reply"> & {
  profiles?: LiveChatAuthor | LiveChatAuthor[] | null;
  reply?: ReplyRow | ReplyRow[] | null;
};

/** Messages chargés à l'ouverture ; la base en garde 500 par monde (migration 202). */
export const LIVE_CHAT_PAGE = 50;
/** Messages gardés en mémoire : au-delà, les plus anciens sortent du fil. */
const LIVE_CHAT_MEMORY = 200;

const SELECT =
  "id, world_id, user_id, content, created_at, channel_id, chatroom_id, reply_to_id, profiles(username, avatar_url), " +
  "reply:world_live_messages!reply_to_id(id, content, user_id, profiles(username))";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

function toMessage(row: Row): LiveChatMessage {
  const { profiles, reply, ...rest } = row;
  const r = one(reply);
  return {
    ...rest,
    author: one(profiles),
    // `reply` absent de la ligne (avis temps réel) : à retrouver ; présent mais
    // nul : le message cité n'est plus lisible.
    ...(reply !== undefined || !row.reply_to_id
      ? { reply: r ? { id: r.id, content: r.content, user_id: r.user_id, username: one(r.profiles)?.username ?? null } : null }
      : {}),
  };
}

/** Insère un message à sa place chronologique, sans doublon. */
export function mergeMessage(list: LiveChatMessage[], msg: LiveChatMessage): LiveChatMessage[] {
  if (list.some((m) => m.id === msg.id)) return list;
  const next = [...list, msg].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return next.length > LIVE_CHAT_MEMORY ? next.slice(next.length - LIVE_CHAT_MEMORY) : next;
}

export type SendResult = "ok" | "too_fast" | "error";

/**
 * Chat en direct d'un monde, dans une salle (`place`, migration 238 : salle
 * principale, salle personnalisée ou fil d'un salon) : derniers messages,
 * flux temps réel, nombre de membres présents, et les salles où un message
 * est arrivé pendant qu'on en lisait une autre (`unread`). Les messages arrivent par le canal privé du monde
 * (`world:<id>`, lib/realtimeHub) ; la présence a son propre canal,
 * `world-live:<id>`, dont le nom est le point de rendez-vous de tous les
 * navigateurs — il reste donc stable (cf. lib/realtimeChannel.ts).
 *
 * `worldId` nul : rien n'est chargé ni ouvert.
 */
export function useWorldLiveChat(worldId: string | null, place: LiveChatPlace = MAIN_PLACE) {
  const supabase = useMemo(() => createClient(), []);
  const { userId, username, avatarUrl } = useCurrentUser();
  const { appearOffline } = useGlobalPresence();
  const reconnectEpoch = useReconnectEpoch();

  const key = placeKey(place);
  // `place` change d'objet à chaque rendu : on suit sa clé.
  const placeRef = useRef(place);
  placeRef.current = place;
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [unread, setUnread] = useState<ReadonlySet<string>>(() => new Set());
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
    setUnread(new Set());
  }, [worldId]);

  // Changer de salle : son fil, et elle n'est plus « non lue ».
  useEffect(() => {
    setMessages([]);
    setUnread((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, [key]);

  /** Le message cité par un message reçu en direct : en mémoire, sinon relu. */
  const resolveReply = useCallback(
    async (msg: LiveChatMessage): Promise<LiveChatMessage> => {
      if (msg.reply !== undefined || !msg.reply_to_id) return msg;
      const known = messagesRef.current.find((m) => m.id === msg.reply_to_id);
      if (known) {
        return { ...msg, reply: { id: known.id, content: known.content, user_id: known.user_id, username: known.author?.username ?? null } };
      }
      const { data } = await supabase
        .from(TABLE.WORLD_LIVE_MESSAGES)
        .select("id, content, user_id, profiles(username)")
        .eq("id", msg.reply_to_id)
        .maybeSingle();
      const r = data as ReplyRow | null;
      return { ...msg, reply: r ? { id: r.id, content: r.content, user_id: r.user_id, username: one(r.profiles)?.username ?? null } : null };
    },
    [supabase],
  );

  // Re-jonction automatique du canal par supabase-js (coupure brève, sans
  // `reconnectEpoch`) : le fil est relu comme après une reconnexion.
  const [resync, setResync] = useState(0);

  // Chargement initial, puis à chaque reconnexion (messages manqués hors ligne).
  useEffect(() => {
    if (!worldId || !userId) return;
    let cancelled = false;
    setLoading(true);
    async function load() {
      const here = placeRef.current;
      let query = supabase.from(TABLE.WORLD_LIVE_MESSAGES).select(SELECT).eq("world_id", worldId);
      query =
        here.kind === "channel"
          ? query.eq("channel_id", here.id)
          : here.kind === "chatroom"
            ? query.eq("chatroom_id", here.id)
            : query.is("channel_id", null).is("chatroom_id", null);
      const { data } = await query.order("created_at", { ascending: false }).limit(LIVE_CHAT_PAGE);
      if (cancelled) return;
      const rows = ((data ?? []) as Row[]).map(toMessage).reverse();
      for (const m of rows) if (m.author) authorsRef.current.set(m.user_id, m.author);
      setMessages((prev) =>
        rows.reduce(mergeMessage, prev.filter((m) => m.world_id === worldId && placeKey(placeOf(m)) === key)),
      );
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId, userId, reconnectEpoch, resync, key]);

  // Flux des messages : canal privé du monde (migration 214), partagé par
  // lib/realtimeHub avec la barre latérale et les autres écrans du monde. Un
  // ajout porte la ligne entière (lisible par tous les membres) ; un retrait,
  // son id.
  //
  // Un message d'un fil de salon arrive sans son contenu (migration 238 : un
  // salon privé ne laisse rien voir) : on le relit, avec nos droits.
  useTopic(worldId && userId ? topic.world(worldId) : null, ({ event, payload }) => {
    if (event !== "live") return;
    const avis = payload as { op?: string; id?: string; chatroom_id?: string | null; record?: Row };
    if (avis.op === "INSERT") {
      const where = avis.record ? placeOf(avis.record) : avis.chatroom_id ? placeOf({ chatroom_id: avis.chatroom_id }) : null;
      if (!where) return;
      const whereKey = placeKey(where);
      if (whereKey !== key) {
        // Une autre salle : on le signale, sans le charger.
        setUnread((prev) => (prev.has(whereKey) ? prev : new Set(prev).add(whereKey)));
        return;
      }
      if (avis.record) {
        const msg = toMessage(avis.record);
        if (msg.world_id !== worldId) return;
        void resolveAuthor(msg)
          .then(resolveReply)
          .then((full) => setMessages((prev) => mergeMessage(prev, full)));
      } else if (avis.id) {
        void supabase
          .from(TABLE.WORLD_LIVE_MESSAGES)
          .select(SELECT)
          .eq("id", avis.id)
          .maybeSingle()
          .then(({ data }: { data: unknown }) => {
            if (!data) return;
            const msg = toMessage(data as Row);
            if (msg.author) authorsRef.current.set(msg.user_id, msg.author);
            setMessages((prev) => mergeMessage(prev, msg));
          });
      }
    } else if (avis.op === "DELETE" && avis.id) {
      const id = avis.id;
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== id)
          // Le message cité n'est plus : la citation le dit.
          .map((m) => (m.reply_to_id === id ? { ...m, reply: null } : m)),
      );
    }
  }, { onResync: () => setResync((n) => n + 1) });

  // Présence : qui regarde le chat en ce moment. Le nom du canal est le point
  // de rendez-vous commun à tous les navigateurs ; il reste donc stable.
  useEffect(() => {
    if (!worldId || !userId) return;

    const close = openRealtimeChannel(
      supabase,
      `world-live:${worldId}`,
      (channel) => {
        channel
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
      // Privé (migration 220) : réservé aux membres du monde.
      { config: { private: true, presence: { key: userId } } },
    );

    return () => {
      channelRef.current?.untrack();
      channelRef.current = null;
      close();
    };
  }, [supabase, worldId, userId, reconnectEpoch]);

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
    async (raw: string, replyToId: string | null = null): Promise<SendResult> => {
      const content = raw.trim();
      if (!worldId || !userId || !content) return "error";
      const here = placeColumns(placeRef.current);
      const { data, error } = await supabase
        .from(TABLE.WORLD_LIVE_MESSAGES)
        .insert({
          world_id: worldId,
          user_id: userId,
          content,
          // Salle principale : colonnes omises, comme avant la migration 238.
          ...(here.channel_id ? { channel_id: here.channel_id } : {}),
          ...(here.chatroom_id ? { chatroom_id: here.chatroom_id } : {}),
          ...(replyToId ? { reply_to_id: replyToId } : {}),
        })
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
      setMessages((prev) => prev.filter((m) => m.id !== id).map((m) => (m.reply_to_id === id ? { ...m, reply: null } : m)));
      return true;
    },
    [supabase],
  );

  return { messages, loading, presentCount, send, remove, userId, unread };
}
