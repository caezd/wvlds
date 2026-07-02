"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { encryptMessage } from "@/lib/crypto";
import { extractMentions } from "@/lib/composerMessage";
import { parseChatBlock } from "@/lib/chat-blocks";
import type { ChatMessageMeta, ChatMessageWithPersona } from "@/types/db";

/**
 * État et logique d'édition d'un message de chatroom : brouillon, options
 * (dialogues en bulles / SMS), sauvegarde (chiffrement, réconciliation de
 * `metadata`, notifications de mention).
 */
export function useChatroomMessageEdit({
  message,
  mine,
  selfId,
  online,
  chatroomKey,
  onUpdated,
  forceEdit,
  onForceEditConsumed,
}: {
  message: ChatMessageWithPersona;
  mine: boolean;
  selfId: string | null;
  online: Record<string, { avatar_url?: string | null; username?: string | null }>;
  chatroomKey?: string | null;
  onUpdated?: (id: number, content: string, metadata: ChatMessageMeta | null) => void;
  forceEdit?: boolean;
  onForceEditConsumed?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(message.content ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editBubbles, setEditBubbles] = useState(false);
  const [editBubbleColor, setEditBubbleColor] = useState<string | null>(null);
  const [editSms, setEditSms] = useState(false);

  // Si un UPDATE arrive via realtime pendant qu'on n'édite pas, on resync le draft
  useEffect(() => {
    if (!editing) setDraft(message.content ?? "");
  }, [message.content, editing]);

  // Initialise les options depuis les métadonnées quand l'édition s'ouvre
  useEffect(() => {
    if (editing) {
      setEditBubbles(message.metadata?.bubbles ?? false);
      setEditBubbleColor(message.metadata?.bubbleColor ?? null);
      setEditSms(message.metadata?.sms ?? false);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = useCallback(() => {
    if (!mine) return;
    setErr(null);
    setDraft(message.content ?? "");
    setEditing(true);
  }, [mine, message.content]);

  useEffect(() => {
    if (forceEdit && mine) {
      startEdit();
      onForceEditConsumed?.();
    }
  }, [forceEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelEdit = useCallback(() => {
    setErr(null);
    setDraft(message.content ?? "");
    setEditing(false);
  }, [message.content]);

  const save = useCallback(async () => {
    if (!mine) return;

    const next = draft;
    if (!next || !next.trim()) {
      setErr("Le message ne peut pas être vide.");
      return;
    }
    const contentUnchanged = next === (message.content ?? "");
    const bubblesUnchanged =
      editBubbles === (message.metadata?.bubbles ?? false) &&
      editBubbleColor === (message.metadata?.bubbleColor ?? null);
    const smsUnchanged = editSms === (message.metadata?.sms ?? false);
    if (contentUnchanged && bubblesUnchanged && smsUnchanged) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setErr(null);

    const encrypted = chatroomKey ? await encryptMessage(next, chatroomKey) : next;

    const wordCount = parseChatBlock(next) !== null
      ? 0
      : next.trim().split(/\s+/).filter(Boolean).length;

    const { bubbles: _b, bubbleColor: _bc, sms: _sms, ...restMeta } = message.metadata ?? {};
    const updatedMetadata = {
      ...restMeta,
      word_count: wordCount,
      ...(editBubbles
        ? { bubbles: true as const, ...(editBubbleColor ? { bubbleColor: editBubbleColor } : {}) }
        : {}),
      ...(editSms ? { sms: true as const } : {}),
    };

    const { error } = await supabase
      .from(TABLE.CHAT_MESSAGES)
      .update({ content: encrypted, metadata: updatedMetadata })
      .eq("id", message.id);

    setSaving(false);

    if (error) {
      setErr(error.message ?? "Erreur lors de la mise à jour.");
      return;
    }

    // Mentions ajoutées lors de l'édition — doublons ignorés silencieusement par le trigger DB
    const mentioned = extractMentions(next);
    if (mentioned.length > 0 && message.world_id && selfId) {
      const [{ data: mentionedProfiles }, { data: chatroomData }] = await Promise.all([
        supabase.from("profiles").select("id").in("username", mentioned),
        supabase.from("chatrooms").select("title, name").eq("id", message.chat_id).single(),
      ]);
      const chatroomTitle =
        (chatroomData as { title?: string | null; name?: string | null } | null)?.title ??
        (chatroomData as { title?: string | null; name?: string | null } | null)?.name ??
        null;
      const recipientIds = (mentionedProfiles ?? [])
        .map((p: { id: string }) => p.id)
        .filter((id: string) => id !== selfId);
      if (recipientIds.length > 0) {
        const { data: members } = await supabase
          .from(TABLE.WORLD_MEMBERS).select("user_id")
          .eq("world_id", message.world_id).in("user_id", recipientIds);
        const validIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
        if (validIds.length > 0) {
          await supabase.from(TABLE.NOTIFICATIONS).insert(
            validIds.map((rid: string) => ({
              recipient_id: rid,
              type: "mention",
              world_id: message.world_id,
              chat_id: message.chat_id,
              message_id: message.id,
              actor_id: selfId,
              actor_name: online[selfId]?.username ?? null,
              content: chatroomTitle,
            })),
          );
        }
      }
    }

    // Mise à jour optimiste avec le texte en clair (déjà déchiffré dans l'état)
    onUpdated?.(message.id, next, updatedMetadata);
    setEditing(false);
  }, [draft, mine, message?.content, message?.id, message?.metadata, editBubbles, editBubbleColor, editSms, onUpdated, supabase, chatroomKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function onKeyDownEdit(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
      return;
    }
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      void save();
    }
  }

  return {
    editing,
    draft,
    setDraft,
    saving,
    err,
    editBubbles,
    setEditBubbles,
    editBubbleColor,
    setEditBubbleColor,
    editSms,
    setEditSms,
    startEdit,
    cancelEdit,
    save,
    onKeyDownEdit,
  };
}
