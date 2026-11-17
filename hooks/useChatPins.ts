"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import type { ChatPin } from "@/types/db";

export function useChatPins(chatId: string | undefined) {
  const supabase = useMemo(() => createClient(), []);
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
  /**
   * Avis `pin` du canal privé du salon (migration 214), relayé par
   * `useRealtimeChatSync` qui tient ce canal : ajout ou modification avec la
   * ligne entière, retrait avec son id.
   */
  const applyPinEvent = useCallback((avis: Record<string, unknown>) => {
    const { op, id, record } = avis as { op?: string; id?: string; record?: ChatPin };
    if (op === "DELETE") {
      if (id) setPins((prev) => prev.filter((p) => p.id !== id));
      return;
    }
    if (!record || record.chat_id !== chatId) return;
    setPins((prev) =>
      prev.some((p) => p.id === record.id)
        ? prev.map((p) => (p.id === record.id ? record : p))
        : [...prev, record],
    );
  }, [chatId]);

  /** Relit les épingles — après une reconnexion, pour rattraper ce qui a été manqué. */
  const reloadPins = useCallback(async () => {
    if (!chatId) return;
    const { data } = await supabase
      .from(TABLE.CHAT_PINS)
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });
    if (data) setPins(data as ChatPin[]);
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

  return { pins, pin, pinAnchor, unpin, updatePinLabel, pinByMessageId, applyPinEvent, reloadPins };
}
