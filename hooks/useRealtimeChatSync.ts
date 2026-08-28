"use client";

import { useEffect, useMemo, useRef } from "react";
import { openRealtimeChannel } from "@/lib/realtimeChannel";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { TABLE, channel as CH } from "@/lib/constants";
import type { ChatMessageWithPersona, ChatMessageMeta } from "@/types/db";
import { toast } from "sonner";

export type ChatroomPatch = {
  title?: string | null;
  name?: string | null;
  banner_url?: string | null;
  icon_url?: string | null;
};

type Props = {
  chatId: string;
  selfId: string | null;
  initialLatestId: number | null;
  onMessageInserted: (msg: ChatMessageWithPersona, authorId?: string) => void;
  onMessageUpdated: (id: number, content: string, metadata: ChatMessageMeta | null) => void;
  onMessageDeleted: (id: number) => void;
  onChatroomPatched: (patch: ChatroomPatch) => void;
  onReactionChange: (messageId: number, emoji: string, delta: 1 | -1) => void;
  onVoteChange?: (messageId: number, prevOptionId: string | null, nextOptionId: string | null) => void;
  onPersonaUpdated?: (personaId: string, avatarUrl: string | null) => void;
};

export function useRealtimeChatSync({
  chatId,
  selfId,
  initialLatestId,
  onMessageInserted,
  onMessageUpdated,
  onMessageDeleted,
  onChatroomPatched,
  onReactionChange,
  onVoteChange,
  onPersonaUpdated,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const reconnectEpoch = useReconnectEpoch();
  const latestIdRef = useRef<number | null>(initialLatestId);

  useEffect(() => {
    latestIdRef.current = initialLatestId;
  }, [chatId, initialLatestId]);

  // Miroir synchronisé PENDANT le rendu (pas dans un effet) : les callbacks du
  // parent sont souvent recréés à chaque rendu (fonctions inline). Si l'effet
  // ci-dessous en dépendait directement, le canal seul et fusionné se
  // fermerait/rouvrirait en boucle à chaque rendu du parent — perdant tout
  // événement arrivant pendant la fenêtre fermée. On les lit via ce ref à
  // l'intérieur des handlers à la place.
  const callbacksRef = useRef({
    onMessageInserted,
    onMessageUpdated,
    onMessageDeleted,
    onChatroomPatched,
    onReactionChange,
    onVoteChange,
    onPersonaUpdated,
  });
  callbacksRef.current = {
    onMessageInserted,
    onMessageUpdated,
    onMessageDeleted,
    onChatroomPatched,
    onReactionChange,
    onVoteChange,
    onPersonaUpdated,
  };

  // Un seul canal Realtime par chatroom (au lieu d'un canal par table/événement) :
  // messages (INSERT/UPDATE/DELETE), chatroom (UPDATE), réactions, votes et avatar
  // persona sont tous multiplexés sur le même canal via plusieurs bindings `.on()`.
  // Réduit le nombre de handshakes `subscribe()` à l'ouverture d'une salle et la
  // charge Realtime (canaux concurrents) côté client comme côté projet Supabase.
  useEffect(() => {
    // isMounted guards against Strict Mode: cleanup sets it to false so that
    // a channel lingering after removeChannel() ignores any late-arriving events.
    let isMounted = true;

    // Nom de canal stable, ouverture sérialisée : une réouverture attend la
    // fermeture précédente. Cf. lib/realtimeChannel.
    const fermerCanal = openRealtimeChannel(supabase, CH.chatMessages(chatId), (ch) => {

    // INSERT — re-fetch avec join persona pour garder la structure uniforme
    ch.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: TABLE.CHAT_MESSAGES,
        filter: `chat_id=eq.${chatId}`,
      },
      async (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (!isMounted) return;

        const id = (payload.new as { id: number }).id;
        if (latestIdRef.current !== null && id <= latestIdRef.current) return;
        latestIdRef.current = id;

        const { data, error } = await supabase
          .from(TABLE.CHAT_MESSAGES)
          .select(
            "id, chat_id, content, author_id, created_at, metadata, visible_to, persona:personas(id, user_id, name, avatar_url)",
          )
          .eq("id", id)
          .single();

        if (!isMounted) return;

        if (error || !data) {
          toast.error("Impossible de charger le nouveau message.");
          return;
        }

        callbacksRef.current.onMessageInserted(
          data as unknown as ChatMessageWithPersona,
          data.author_id ?? undefined,
        );
      },
    );

    // DELETE — suppression de message
    ch.on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: TABLE.CHAT_MESSAGES,
        filter: `chat_id=eq.${chatId}`,
      },
      (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (!isMounted) return;
        const id = (payload.old as { id: number }).id;
        if (id) callbacksRef.current.onMessageDeleted(id);
      },
    );

    // UPDATE — édition de contenu
    ch.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: TABLE.CHAT_MESSAGES,
        filter: `chat_id=eq.${chatId}`,
      },
      (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (!isMounted) return;
        const next = payload.new as { id: number; content: string; metadata: ChatMessageMeta | null };
        callbacksRef.current.onMessageUpdated(next.id, next.content, next.metadata ?? null);
      },
    );

    // UPDATE chatroom — titre / bannière / icône
    ch.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: TABLE.CHATROOMS,
        filter: `id=eq.${chatId}`,
      },
      (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (!isMounted) return;
        callbacksRef.current.onChatroomPatched(payload.new as ChatroomPatch);
      },
    );

    // Reactions INSERT / DELETE
    ch.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: TABLE.CHAT_MESSAGE_REACTIONS,
        filter: `chat_id=eq.${chatId}`,
      },
      (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
        if (!isMounted) return;
        const ev = payload.eventType;
        if (ev !== "INSERT" && ev !== "DELETE") return;

        type ReactionRow = { message_id: number; emoji: string; user_id: string };
        const row = (ev === "DELETE" ? payload.old : payload.new) as ReactionRow | null;
        if (!row) return;

        if (selfId && row.user_id === selfId) return;

        callbacksRef.current.onReactionChange(row.message_id, row.emoji, ev === "INSERT" ? 1 : -1);
      },
    );

    // Personas UPDATE — avatar_url mis à jour
    if (callbacksRef.current.onPersonaUpdated) {
      ch.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "personas" },
        (payload: { new: Record<string, unknown> }) => {
          if (!isMounted) return;
          const row = payload.new as { id: string; avatar_url?: string | null };
          if (row.id) callbacksRef.current.onPersonaUpdated?.(row.id, row.avatar_url ?? null);
        },
      );
    }

    // Votes de choix INSERT / UPDATE (revote) / DELETE
    if (callbacksRef.current.onVoteChange) {
      ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: TABLE.CHAT_CHOICE_VOTES,
          filter: `chat_id=eq.${chatId}`,
        },
        (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (!isMounted) return;
          const ev = payload.eventType;
          if (ev !== "INSERT" && ev !== "UPDATE" && ev !== "DELETE") return;

          type VoteRow = { message_id: number; option_id: string; user_id: string };
          const newRow = payload.new as VoteRow | null;
          const oldRow = payload.old as VoteRow | null;
          const row = ev === "DELETE" ? oldRow : newRow;
          if (!row) return;

          if (selfId && row.user_id === selfId) return;

          callbacksRef.current.onVoteChange?.(
            row.message_id,
            ev === "INSERT" ? null : (oldRow?.option_id ?? null),
            ev === "DELETE" ? null : (newRow?.option_id ?? null),
          );
        },
      );
    }

ch.subscribe();
return ch;
    });

    return () => {
      isMounted = false;
      fermerCanal();
    };
    // onVoteChange/onPersonaUpdated délibérément absents des deps : seule leur
    // présence (fournis ou non par l'appelant) compte pour construire les
    // bindings, lue via callbacksRef au moment où l'effet tourne — pas leur
    // identité de fonction, qui changerait à chaque rendu du parent.
  }, [chatId, supabase, selfId, reconnectEpoch]);
}
