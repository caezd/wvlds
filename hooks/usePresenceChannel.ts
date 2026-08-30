"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { DELAY } from "@/lib/constants";
import type { Persona } from "@/types/db";
import { openRealtimeChannel } from "@/lib/realtimeChannel";

export type PresenceMeta = {
  user_id: string;
  username?: string | null;
  avatar_url?: string | null;
  persona_name?: string | null;
};

type TypingEntry = {
  username?: string | null;
  personaName?: string | null;
  ts: number;
};

function parsePresenceState(
  state: Record<string, unknown>,
): Record<string, PresenceMeta> {
  const res: Record<string, PresenceMeta> = {};
  for (const [userId, entry] of Object.entries(state)) {
    const raw = entry as { metas?: PresenceMeta[] } | PresenceMeta[];
    const metas = Array.isArray(raw) ? raw : (raw?.metas ?? []);
    const latest = (metas as PresenceMeta[])[metas.length - 1] ?? {};
    res[userId] = {
      user_id: userId,
      username: latest.username ?? null,
      avatar_url: latest.avatar_url ?? null,
      persona_name: latest.persona_name ?? null,
    };
  }
  return res;
}

export function usePresenceChannel({
  chatId,
  persona,
}: {
  chatId: string;
  persona: Persona | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { userId, username, avatarUrl } = useCurrentUser();
  const reconnectEpoch = useReconnectEpoch();
  const [online, setOnline] = useState<Record<string, PresenceMeta>>({});
  const [typing, setTyping] = useState<Record<string, TypingEntry>>({});

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const meRef = useRef<{
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null>(null);

  // Identité courante issue du contexte, via ref pour le payload de présence
  // sans relancer l'abonnement quand le pseudo/avatar change.
  const selfRef = useRef({ username, avatarUrl });
  useEffect(() => {
    selfRef.current = { username, avatarUrl };
  }, [username, avatarUrl]);

  // Présence + broadcast typing
  useEffect(() => {
    if (!userId) return;

    // Identité résolue par le contexte (une seule fois) — plus de getUser() ni
    // de select profiles à chaque ouverture de chatroom.
    meRef.current = {
      id: userId,
      username: selfRef.current.username,
      avatar_url: selfRef.current.avatarUrl,
    };

    // Le nom du canal est le POINT DE RENDEZ-VOUS entre navigateurs : tous
    // les occupants de la salle doivent le partager, sinon chacun se retrouve
    // seul dans son propre canal et la présence ne montre plus personne. Il
    // reste donc stable, et c'est l'enchaînement ouverture/fermeture qui est
    // sérialisé. Cf. lib/realtimeChannel.
    const fermerCanal = openRealtimeChannel(
      supabase,
      `chat:${chatId}`,
      (channel) => {

    channel.on("presence", { event: "sync" }, () => {
      setOnline(parsePresenceState(channel.presenceState()));
    });

    channel.on("broadcast", { event: "typing" }, ({ payload }: { payload: Record<string, unknown> }) => {
      const { user_id, username: typedUsername, persona_name } = payload as {
        user_id: string;
        username?: string | null;
        persona_name?: string | null;
      };

      setTyping((prev) => ({
        ...prev,
        [user_id]: { username: typedUsername, personaName: persona_name, ts: Date.now() },
      }));

      window.setTimeout(() => {
        setTyping((curr) => {
          const t = curr[user_id];
          if (!t || Date.now() - t.ts < DELAY.TYPING_TIMEOUT - 200) return curr;
          const copy = { ...curr };
          delete copy[user_id];
          return copy;
        });
      }, DELAY.TYPING_TIMEOUT);
    });

    channel.subscribe(async (status: string) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({
        user_id: userId,
        username: meRef.current?.username ?? null,
        avatar_url: meRef.current?.avatar_url ?? null,
        persona_name: persona?.name ?? null,
      });
      setOnline(parsePresenceState(channel.presenceState()));
    });

    channelRef.current = channel;
    return channel;
      },
      {
        config: {
          presence: { key: userId },
          broadcast: { self: false },
        },
      },
    );

    return () => {
      // `untrack()` retire notre présence de la salle avant la fermeture ;
      // sans lui, les autres nous verraient encore le temps du prochain sync.
      channelRef.current?.untrack();
      channelRef.current = null;
      fermerCanal();
    };
    // reconnectEpoch : force la recréation du canal après une coupure réseau
    // (voir useReconnectEpoch).
  }, [chatId, supabase, userId, reconnectEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mettre à jour le track quand la persona change
  useEffect(() => {
    const me = meRef.current;
    const ch = channelRef.current;
    if (!me || !ch) return;
    ch.track({
      user_id: me.id,
      username: me.username,
      avatar_url: me.avatar_url,
      persona_name: persona?.name ?? null,
    }).then(() => {
      setOnline(parsePresenceState(ch.presenceState()));
    });
  }, [persona?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function emitTyping() {
    const now = Date.now();
    if (!channelRef.current) return;
    if (now - lastTypingSentRef.current < DELAY.TYPING_THROTTLE) return;
    lastTypingSentRef.current = now;

    const me = meRef.current;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: me?.id,
        username: me?.username,
        persona_name: persona?.name ?? null,
      },
    });
  }

  const typingLine = (() => {
    const entries = Object.values(typing);
    if (!entries.length) return "";
    const names = entries
      .map((e) => (e.username ? `@${e.username}` : "Quelqu'un"))
      .slice(0, 3);
    const who = names.join(", ");
    const withPersona = entries[0]?.personaName ? ` avec ${entries[0].personaName}` : "";
    return `${who} ${names.length > 1 ? "écrivent" : "écrit"}${withPersona}...`;
  })();

  function clearTyping(userId: string) {
    setTyping((curr) => {
      if (!curr[userId]) return curr;
      const copy = { ...curr };
      delete copy[userId];
      return copy;
    });
  }

  return { online, emitTyping, typingLine, clearTyping };
}
