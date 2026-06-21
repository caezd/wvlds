"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { TABLE, channel } from "@/lib/constants";
import type { ChatPin } from "@/types/db";

export function useChatPins(chatId: string | undefined) {
  const supabase = useMemo(() => createClient(), []);
  const [pins, setPins] = useState<ChatPin[]>([]);

  // Chargement initial
  useEffect(() => {
    if (!chatId) return;
    supabase
      .from(TABLE.CHAT_PINS)
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .then(({ data }: { data: ChatPin[] | null }) => {
        if (data) setPins(data);
      });
  }, [chatId, supabase]);

  // Realtime — INSERT / DELETE
  useEffect(() => {
    if (!chatId) return;
    const ch = supabase
      .channel(channel.chatPins(chatId))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: TABLE.CHAT_PINS, filter: `chat_id=eq.${chatId}` },
        (payload: { new: Record<string, unknown> }) => {
          const pin = payload.new as ChatPin;
          setPins((prev) => prev.some((p) => p.id === pin.id) ? prev : [...prev, pin]);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: TABLE.CHAT_PINS, filter: `chat_id=eq.${chatId}` },
        (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new as ChatPin;
          setPins((prev) => prev.map((p) => p.id === updated.id ? updated : p));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: TABLE.CHAT_PINS, filter: `chat_id=eq.${chatId}` },
        (payload: { old: Record<string, unknown> }) => {
          const old = payload.old as { id: string };
          setPins((prev) => prev.filter((p) => p.id !== old.id));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId, supabase]);

  const pin = useCallback(async (messageId: number, selfId: string) => {
    if (!chatId) return;
    const { data, error } = await supabase
      .from(TABLE.CHAT_PINS)
      .insert({ chat_id: chatId, message_id: messageId, pinned_by: selfId })
      .select()
      .single();
    if (!error && data) setPins((prev) => [...prev, data as ChatPin]);
  }, [chatId, supabase]);

  const pinAnchor = useCallback(async (messageId: number, label: string, selfId: string) => {
    if (!chatId) return;
    const { data, error } = await supabase
      .from(TABLE.CHAT_PINS)
      .insert({ chat_id: chatId, message_id: messageId, label, pinned_by: selfId })
      .select()
      .single();
    if (!error && data) setPins((prev) => [...prev, data as ChatPin]);
  }, [chatId, supabase]);

  const updatePinLabel = useCallback(async (pinId: string, label: string) => {
    const { error } = await supabase
      .from(TABLE.CHAT_PINS)
      .update({ label })
      .eq("id", pinId);
    if (!error) setPins((prev) => prev.map((p) => p.id === pinId ? { ...p, label } : p));
  }, [supabase]);

  const unpin = useCallback(async (pinId: string) => {
    const { error } = await supabase
      .from(TABLE.CHAT_PINS)
      .delete()
      .eq("id", pinId);
    if (!error) setPins((prev) => prev.filter((p) => p.id !== pinId));
  }, [supabase]);

  const pinByMessageId = useCallback((messageId: number) =>
    pins.find((p) => p.message_id === messageId) ?? null,
  [pins]);

  return { pins, pin, pinAnchor, unpin, updatePinLabel, pinByMessageId };
}
