"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { TABLE, channel } from "@/lib/constants";
import type { ChatPin } from "@/types/db";

export function useChatPins(chatId: string | undefined) {
  const supabase = useMemo(() => createClient(), []);
  const reconnectEpoch = useReconnectEpoch();
  const [pins, setPins] = useState<ChatPin[]>([]);

  // Chargement initial.
  //
  // `ChatRoomView` n'est pas remonté quand on passe d'un salon à l'autre (même
  // position dans l'arbre, pas de `key`) : ce hook garde donc son état d'un
  // salon au suivant. Sans les deux précautions ci-dessous, changer de salon
  // laissait les épingles du précédent à l'écran — et `view.tsx` allait alors
  // chercher les messages épinglés de l'ancien salon pour les déchiffrer avec
  // la clé du nouveau.
  useEffect(() => {
    // 1) On repart d'une liste vide immédiatement, sans attendre la réponse.
    setPins([]);
    if (!chatId) return;

    // 2) Une réponse tardive pour un salon déjà quitté est ignorée : deux
    //    navigations rapprochées peuvent revenir dans le désordre.
    let cancelled = false;
    supabase
      .from(TABLE.CHAT_PINS)
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .then(({ data }: { data: ChatPin[] | null }) => {
        if (cancelled || !data) return;
        setPins(data);
      });
    return () => { cancelled = true; };
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
  }, [chatId, supabase, reconnectEpoch]);

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
