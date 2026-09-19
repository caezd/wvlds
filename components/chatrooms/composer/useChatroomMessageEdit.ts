"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { encryptMessage } from "@/lib/crypto";
import { notifyMentions } from "@/lib/notifyMentions";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { parseChatBlock } from "@/lib/chat-blocks";
import { useTagChips } from "@/hooks/useTagChips";
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
  const { roles: worldRoles } = useWorldMembership();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(message.content ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editBubbles, setEditBubbles] = useState(false);
  const [editBubbleColor, setEditBubbleColor] = useState<string | null>(null);
  const [editSms, setEditSms] = useState(false);
  const contentWarningsChips = useTagChips(null);

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
      contentWarningsChips.reset(message.metadata?.content_warnings?.length ? message.metadata.content_warnings : null);
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
    const priorContentWarnings = message.metadata?.content_warnings ?? [];
    const nextContentWarnings = contentWarningsChips.tags ?? [];
    const contentWarningsUnchanged =
      priorContentWarnings.length === nextContentWarnings.length &&
      priorContentWarnings.every((tag, i) => tag === nextContentWarnings[i]);
    if (contentUnchanged && bubblesUnchanged && smsUnchanged && contentWarningsUnchanged) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setErr(null);

    const encrypted = chatroomKey ? await encryptMessage(next, chatroomKey) : next;

    const wordCount = parseChatBlock(next) !== null
      ? 0
      : next.trim().split(/\s+/).filter(Boolean).length;

    const { bubbles: _b, bubbleColor: _bc, sms: _sms, content_warnings: _cw, ...restMeta } = message.metadata ?? {};
    const updatedMetadata = {
      ...restMeta,
      word_count: wordCount,
      ...(editBubbles
        ? { bubbles: true as const, ...(editBubbleColor ? { bubbleColor: editBubbleColor } : {}) }
        : {}),
      ...(editSms ? { sms: true as const } : {}),
      ...(contentWarningsChips.tags?.length ? { content_warnings: contentWarningsChips.tags } : {}),
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

    // Mentions ajoutées lors de l'édition — les doublons sont ignorés par le
    // déclencheur de la base (une alerte par membre et par message).
    if (message.world_id && selfId) {
      await notifyMentions(supabase, {
        text: next,
        messageId: message.id,
        chatId: message.chat_id,
        worldId: message.world_id,
        selfId,
        selfUsername: online[selfId]?.username ?? null,
        roles: worldRoles,
        // Les présents du canal du salon : ce que le hook connaît de la présence.
        onlineMemberIds: Object.keys(online).filter((id) => id !== selfId),
      });
    }

    // Mise à jour optimiste avec le texte en clair (déjà déchiffré dans l'état)
    onUpdated?.(message.id, next, updatedMetadata);
    setEditing(false);
  }, [draft, mine, message?.content, message?.id, message?.metadata, editBubbles, editBubbleColor, editSms, contentWarningsChips.tags, onUpdated, supabase, chatroomKey, worldRoles]); // eslint-disable-line react-hooks/exhaustive-deps

  function onKeyDownEdit(e: React.KeyboardEvent<HTMLElement>) {
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
    contentWarningsChips,
    startEdit,
    cancelEdit,
    save,
    onKeyDownEdit,
  };
}
