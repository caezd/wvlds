"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { TABLE, channel as CH } from "@/lib/constants";
import type { ChatMessageWithPersona } from "@/types/db";
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
  onMessageUpdated: (id: number, content: string) => void;
  onMessageDeleted: (id: number) => void;
  onChatroomPatched: (patch: ChatroomPatch) => void;
  onReactionChange: (messageId: number, emoji: string, delta: 1 | -1) => void;
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
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const latestIdRef = useRef<number | null>(initialLatestId);

  useEffect(() => {
    latestIdRef.current = initialLatestId;
  }, [chatId, initialLatestId]);

  // INSERT — re-fetch avec join persona pour garder la structure uniforme
  useEffect(() => {
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
          const id = (payload.new as { id: number }).id;
          if (latestIdRef.current !== null && id <= latestIdRef.current) return;

          const { data, error } = await supabase
            .from(TABLE.CHAT_MESSAGES)
            .select(
              "id, chat_id, content, author_id, created_at, metadata, persona:personas(id, user_id, name, avatar_url)",
            )
            .eq("id", id)
            .single();

          if (error || !data) {
            toast.error("Impossible de charger le nouveau message.");
            return;
          }

          latestIdRef.current = id;
          onMessageInserted(
            data as unknown as ChatMessageWithPersona,
            data.author_id ?? undefined,
          );
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [chatId, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // DELETE — suppression de message
  useEffect(() => {
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
          const id = (payload.old as { id: number }).id;
          if (id) onMessageDeleted(id);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [chatId, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // UPDATE — édition de contenu
  useEffect(() => {
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
          const next = payload.new as { id: number; content: string };
          onMessageUpdated(next.id, next.content);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [chatId, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // UPDATE chatroom — titre / bannière / icône
  useEffect(() => {
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
          onChatroomPatched(payload.new as ChatroomPatch);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
  }, [chatId, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reactions INSERT / DELETE
  useEffect(() => {
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

    return () => { void supabase.removeChannel(ch); };
  }, [chatId, supabase, selfId]); // eslint-disable-line react-hooks/exhaustive-deps
}
