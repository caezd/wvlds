"use client";

import { useEffect, useMemo, useRef } from "react";
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

  // INSERT — re-fetch avec join persona pour garder la structure uniforme
  useEffect(() => {
    // isMounted guards against Strict Mode: cleanup sets it to false so that
    // a channel lingering after removeChannel() ignores any late-arriving events.
    let isMounted = true;

    const ch = supabase
      .channel(CH.chatMessages(chatId))
      .on(
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

          onMessageInserted(
            data as unknown as ChatMessageWithPersona,
            data.author_id ?? undefined,
          );
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(ch);
    };
  }, [chatId, supabase, reconnectEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // DELETE — suppression de message
  useEffect(() => {
    let isMounted = true;

    const ch = supabase
      .channel(`${CH.chatMessages(chatId)}-delete`)
      .on(
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
          if (id) onMessageDeleted(id);
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(ch);
    };
  }, [chatId, supabase, reconnectEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // UPDATE — édition de contenu
  useEffect(() => {
    let isMounted = true;

    const ch = supabase
      .channel(CH.chatMessageUpdates(chatId))
      .on(
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
          onMessageUpdated(next.id, next.content, next.metadata ?? null);
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(ch);
    };
  }, [chatId, supabase, reconnectEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // UPDATE chatroom — titre / bannière / icône
  useEffect(() => {
    let isMounted = true;

    const ch = supabase
      .channel(CH.chatroomUpdates(chatId))
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: TABLE.CHATROOMS,
          filter: `id=eq.${chatId}`,
        },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (!isMounted) return;
          onChatroomPatched(payload.new as ChatroomPatch);
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(ch);
    };
  }, [chatId, supabase, reconnectEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Personas UPDATE — avatar_url mis à jour
  useEffect(() => {
    if (!onPersonaUpdated) return;
    let isMounted = true;

    const ch = supabase
      .channel(`personas-avatar-${chatId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "personas" },
        (payload: { new: Record<string, unknown> }) => {
          if (!isMounted) return;
          const row = payload.new as { id: string; avatar_url?: string | null };
          if (row.id) onPersonaUpdated(row.id, row.avatar_url ?? null);
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(ch);
    };
  }, [chatId, supabase, onPersonaUpdated, reconnectEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reactions INSERT / DELETE
  useEffect(() => {
    let isMounted = true;

    const ch = supabase
      .channel(CH.chatReactions(chatId))
      .on(
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

          onReactionChange(row.message_id, row.emoji, ev === "INSERT" ? 1 : -1);
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(ch);
    };
  }, [chatId, supabase, selfId, reconnectEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Votes de choix INSERT / UPDATE (revote) / DELETE
  useEffect(() => {
    if (!onVoteChange) return;
    let isMounted = true;

    const ch = supabase
      .channel(CH.chatVotes(chatId))
      .on(
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

          onVoteChange(
            row.message_id,
            ev === "INSERT" ? null : (oldRow?.option_id ?? null),
            ev === "DELETE" ? null : (newRow?.option_id ?? null),
          );
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(ch);
    };
  }, [chatId, supabase, selfId, onVoteChange, reconnectEpoch]); // eslint-disable-line react-hooks/exhaustive-deps
}
