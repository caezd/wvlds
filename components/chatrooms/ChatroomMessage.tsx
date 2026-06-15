"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { encryptMessage } from "@/lib/crypto";
import type { ReactionSummary } from "@/types/db";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { ChatroomMessageBubble } from "./ChatroomMessageBubble";
import { parseChatBlock, type ChatBlock } from "@/lib/chat-blocks";
import { DiceBlockView } from "./blocks/DiceBlock";
import { EllipseBlockView } from "./blocks/EllipseBlock";
import { BannerBlockView } from "./blocks/BannerBlock";
import { SceneBlockView } from "./blocks/SceneBlock";
import { FlashbackBlockView } from "./blocks/FlashbackBlock";
import { RevealBlockView } from "./blocks/RevealBlock";
import { NpcBlockView } from "./blocks/NpcBlock";
import { AlertBlockView } from "./blocks/AlertBlock";
import { WeatherBlockView } from "./blocks/WeatherBlock";
import { HpBlockView } from "./blocks/HpBlock";
import { WhisperBlockView } from "./blocks/WhisperBlock";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import DateDisplay from "@/components/date-display";

import { Button } from "@/components/ui/button";
import { Pencil, Check, X, Loader2, SmilePlus, Trash2, MessageCircle, Lock } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { PersonaProfileSheetTrigger } from "@/components/personas/PersonaProfileSheetTrigger";
import { ChatReactionPicker } from "./ChatReactionPicker";
import { ReactionEmoji } from "./ReactionEmoji";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";

/**
 * IMPORTANT:
 * - On garde ton schéma tel quel: `chat_message_reactions.emoji` existe déjà.
 * - Ici, `emoji` devient simplement un "emote key" (ex: "thumbsup", "heart", etc.)
 * - L’image affichée est résolue via ce catalogue local.
 *
 * Assets:
 *   public/emotes/thumbsup.png
 *   public/emotes/heart.png
 *   ...
 */

function optimisticToggle(current: ReactionSummary[], emoji: string) {
  const arr = [...current];
  const idx = arr.findIndex((r) => r.emoji === emoji);

  if (idx === -1) {
    arr.push({ emoji, count: 1, me: true });
  } else {
    const r = arr[idx];
    if (r.me) {
      const nextCount = r.count - 1;
      if (nextCount <= 0) arr.splice(idx, 1);
      else arr[idx] = { ...r, count: nextCount, me: false };
    } else {
      arr[idx] = { ...r, count: r.count + 1, me: true };
    }
  }

  arr.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
  return arr;
}



function isMyMessage(
  m: {
    author_id?: string | null;
    persona?: { user_id?: string | null } | null;
  },
  myId?: string | null,
) {
  if (!myId) return false;
  return (m.author_id ?? m.persona?.user_id ?? null) === myId;
}


export default function ChatroomMessage({
  message,
  online,
  invisibleUsers,
  selfId,
  onUpdated,
  onDeleted,
  onReactionsUpdated,
  chatroomKey,
  forceEdit,
  onForceEditConsumed,
}: {
  message: import("@/types/db").ChatMessageWithPersona;
  online: Record<string, { avatar_url?: string | null; username?: string | null }>;
  invisibleUsers?: Set<string>;
  selfId: string | null;
  onUpdated?: (id: number, content: string) => void;
  onDeleted?: (id: number) => void;
  onReactionsUpdated?: (id: number, reactions: ReactionSummary[]) => void;
  chatroomKey?: string | null;
  forceEdit?: boolean;
  onForceEditConsumed?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const block = parseChatBlock(message.content ?? "") as ChatBlock | null;
  const blockRef: ChatBlock | null = block;
  const mine = isMyMessage(message, selfId);
  const isOnline = !!online[message.author_id];
  const presenceState: "online" | "offline" | "invisible" = isOnline
    ? "online"
    : (invisibleUsers?.has(message.author_id) ? "invisible" : "offline");
  const avatarSrc = online[message.author_id]?.avatar_url ?? undefined;

  const date = message.created_at;

  const userId = message.author_id ?? message.persona?.user_id ?? null;
  const label =
    message.persona?.name ??
    online[message.author_id]?.username ??
    "Profil";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(message.content ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editBubbles, setEditBubbles] = useState(false);
  const [editBubbleColor, setEditBubbleColor] = useState<string | null>(null);

  const [editingDiceLabel, setEditingDiceLabel] = useState(false);
  const [diceLabelDraft, setDiceLabelDraft] = useState("");

  const [pickerOpen, setPickerOpen] = useState(false);
  const { emoji_reactions } = useFeatureFlags();

  // Si un UPDATE arrive via realtime pendant qu’on n’édite pas, on resync le draft
  useEffect(() => {
    if (!editing) setDraft(message.content ?? "");
  }, [message.content, editing]);

  // Initialise les options depuis les métadonnées quand l’édition s’ouvre
  useEffect(() => {
    if (editing) {
      setEditBubbles(message.metadata?.bubbles ?? false);
      setEditBubbleColor(message.metadata?.bubbleColor ?? null);
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
    if (contentUnchanged && bubblesUnchanged) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setErr(null);

    const encrypted = chatroomKey ? await encryptMessage(next, chatroomKey) : next;

    const wordCount = parseChatBlock(next) !== null
      ? 0
      : next.trim().split(/\s+/).filter(Boolean).length;

    const { bubbles: _b, bubbleColor: _bc, ...restMeta } = message.metadata ?? {};
    const updatedMetadata = {
      ...restMeta,
      word_count: wordCount,
      ...(editBubbles
        ? { bubbles: true as const, ...(editBubbleColor ? { bubbleColor: editBubbleColor } : {}) }
        : {}),
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

    // Mise à jour optimiste avec le texte en clair (déjà déchiffré dans l'état)
    onUpdated?.(message.id, next);
    setEditing(false);
  }, [draft, mine, message?.content, message?.id, message?.metadata, editBubbles, editBubbleColor, onUpdated, supabase, chatroomKey]);

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

  const frameUrl = message.persona?.frame?.asset_url ?? null;

  /* reactions */
  const reactions = (message.reactions ?? []) as ReactionSummary[];

  async function toggleReaction(emoteKey: string) {
    if (!selfId) {
      toast.error("Vous devez être connecté pour réagir.");
      return;
    }

    // optimistic
    const prev = reactions;
    const next = optimisticToggle(prev, emoteKey);
    onReactionsUpdated?.(message.id, next);

    const alreadyReacted = prev.some((r) => r.emoji === emoteKey && r.me);

    // DB (colonne "emoji" conservée): on stocke le KEY dedans
    const q = alreadyReacted
      ? supabase.from(TABLE.CHAT_MESSAGE_REACTIONS).delete().match({
        chat_id: message.chat_id,
        message_id: message.id,
        user_id: selfId,
        emoji: emoteKey,
      })
      : supabase.from(TABLE.CHAT_MESSAGE_REACTIONS).insert({
        chat_id: message.chat_id,
        message_id: message.id,
        user_id: selfId,
        emoji: emoteKey,
      });

    const { error } = await q;
    if (error) {
      onReactionsUpdated?.(message.id, prev);
      toast.error(error.message ?? "Impossible de réagir.");
    }
  }
  /* reactions */

  // Rendu spécial : lancé de dé (ligne unique sans avatar)
  if (block?._type === "dice") {
    const saveDiceLabel = async () => {
      const updated = { ...block, label: diceLabelDraft.trim() || undefined };
      const newContent = JSON.stringify(updated);
      const encrypted = chatroomKey ? await encryptMessage(newContent, chatroomKey) : newContent;
      const { error } = await supabase.from(TABLE.CHAT_MESSAGES).update({ content: encrypted }).eq("id", message.id);
      if (error) toast.error("Impossible de modifier : " + error.message);
      else { setEditingDiceLabel(false); onUpdated?.(message.id, newContent); }
    };

    return (
      <div className="w-full py-8 group/turn-messages flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground italic">
          <strong className="font-medium not-italic text-foreground">{label}</strong>{" "}
          <DiceBlockView block={block} mine={mine} />
          {editingDiceLabel && (
            <input
              autoFocus
              value={diceLabelDraft}
              onChange={(e) => setDiceLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveDiceLabel();
                if (e.key === "Escape") setEditingDiceLabel(false);
              }}
              placeholder="Description…"
              className="ml-2 not-italic bg-transparent border-b border-border focus:border-primary outline-none text-sm text-foreground w-36"
            />
          )}
        </span>
        {mine && (
          <div className="flex items-center gap-1 opacity-0 group-hover/turn-messages:opacity-100 transition-opacity shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Modifier la description"
              onClick={() => { setDiceLabelDraft(block.label ?? ""); setEditingDiceLabel(true); }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <DeleteConfirmDialog
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  aria-label="Supprimer le lancé"
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              }
              description="Le lancé de dé sera supprimé définitivement."
              onConfirm={async () => {
                const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
                if (error) toast.error("Impossible de supprimer le lancé : " + error.message);
              }}
            />
          </div>
        )}
      </div>
    );
  }

  // Rendu spécial : ellipse de temps (séparateur pleine largeur)
  if (block?._type === "ellipse") {
    return (
      <EllipseBlockView
        block={block}
        canEdit={mine}
        onEdit={async (content) => {
          const encrypted = chatroomKey ? await encryptMessage(content, chatroomKey) : content;
          await supabase.from(TABLE.CHAT_MESSAGES).update({ content: encrypted }).eq("id", message.id);
          onUpdated?.(message.id, content);
        }}
        onDelete={async () => {
          const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
          if (error) toast.error("Impossible de supprimer l'ellipse : " + error.message);
        }}
      />
    );
  }

  if (block?._type === "banner") {
    return (
      <div className="py-8">
        <BannerBlockView
          block={block}
          mine={mine}
          onDelete={async () => {
            try {
              const pathMatch = block.url.match(/\/chat-banners\/(.+)$/);
              if (pathMatch?.[1]) {
                await supabase.storage.from("chat-banners").remove([pathMatch[1]]);
              }
            } catch { /* non-bloquant */ }
            const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
            if (error) toast.error("Impossible de supprimer la bannière : " + error.message);
          }}
        />
      </div>
    );
  }

  if (block?._type === "scene") {
    return (
      <SceneBlockView
        block={block}
        mine={mine}
        onEdit={async (content) => {
          const encrypted = chatroomKey ? await encryptMessage(content, chatroomKey) : content;
          await supabase.from(TABLE.CHAT_MESSAGES).update({ content: encrypted }).eq("id", message.id);
          onUpdated?.(message.id, content);
        }}
        onDelete={async () => {
          const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
          if (error) toast.error("Impossible de supprimer la scène : " + error.message);
        }}
      />
    );
  }

  if (block?._type === "flashback") {
    return (
      <div className="py-8">
        <FlashbackBlockView
          block={block}
          mine={mine}
          onEdit={async (content) => {
            const encrypted = chatroomKey ? await encryptMessage(content, chatroomKey) : content;
            await supabase.from(TABLE.CHAT_MESSAGES).update({ content: encrypted }).eq("id", message.id);
            onUpdated?.(message.id, content);
          }}
          onDelete={async () => {
            const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
            if (error) toast.error("Impossible de supprimer le flashback : " + error.message);
          }}
        />
      </div>
    );
  }

  if (block?._type === "reveal") {
    return (
      <div className="py-8">
        <RevealBlockView
          block={block}
          mine={mine}
          onEdit={async (content) => {
            const encrypted = chatroomKey ? await encryptMessage(content, chatroomKey) : content;
            await supabase.from(TABLE.CHAT_MESSAGES).update({ content: encrypted }).eq("id", message.id);
            onUpdated?.(message.id, content);
          }}
          onDelete={async () => {
            const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
            if (error) toast.error("Impossible de supprimer la révélation : " + error.message);
          }}
        />
      </div>
    );
  }

  if (block?._type === "npc") {
    return (
      <div className="py-4">
        <NpcBlockView
          block={block}
          mine={mine}
          onEdit={async (content) => {
            const encrypted = chatroomKey ? await encryptMessage(content, chatroomKey) : content;
            await supabase.from(TABLE.CHAT_MESSAGES).update({ content: encrypted }).eq("id", message.id);
            onUpdated?.(message.id, content);
          }}
          onDelete={async () => {
            const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
            if (error) toast.error("Impossible de supprimer la fiche PNJ : " + error.message);
          }}
        />
      </div>
    );
  }

  if (block?._type === "alert") {
    return (
      <div className="py-4">
        <AlertBlockView
          block={block}
          mine={mine}
          onEdit={async (content) => {
            const encrypted = chatroomKey ? await encryptMessage(content, chatroomKey) : content;
            await supabase.from(TABLE.CHAT_MESSAGES).update({ content: encrypted }).eq("id", message.id);
            onUpdated?.(message.id, content);
          }}
          onDelete={async () => {
            const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
            if (error) toast.error("Impossible de supprimer l'alerte : " + error.message);
          }}
        />
      </div>
    );
  }

  if (block?._type === "weather") {
    return (
      <div className="py-4">
        <WeatherBlockView
          block={block}
          mine={mine}
          onEdit={async (content) => {
            const encrypted = chatroomKey ? await encryptMessage(content, chatroomKey) : content;
            await supabase.from(TABLE.CHAT_MESSAGES).update({ content: encrypted }).eq("id", message.id);
            onUpdated?.(message.id, content);
          }}
          onDelete={async () => {
            const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
            if (error) toast.error("Impossible de supprimer le bloc météo : " + error.message);
          }}
        />
      </div>
    );
  }

  if (block?._type === "hp") {
    return (
      <div className="py-4">
        <HpBlockView
          block={block}
          mine={mine}
          onEdit={async (content) => {
            const encrypted = chatroomKey ? await encryptMessage(content, chatroomKey) : content;
            await supabase.from(TABLE.CHAT_MESSAGES).update({ content: encrypted }).eq("id", message.id);
            onUpdated?.(message.id, content);
          }}
          onDelete={async () => {
            const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
            if (error) toast.error("Impossible de supprimer la jauge de vie : " + error.message);
          }}
        />
      </div>
    );
  }

  if (block?._type === "whisper") {
    return (
      <div className="py-4">
        <WhisperBlockView
          block={block}
          mine={mine}
          onEdit={async (content) => {
            const encrypted = chatroomKey ? await encryptMessage(content, chatroomKey) : content;
            await supabase.from(TABLE.CHAT_MESSAGES).update({ content: encrypted }).eq("id", message.id);
            onUpdated?.(message.id, content);
          }}
          onDelete={async () => {
            const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
            if (error) toast.error("Impossible de supprimer l'aparté : " + error.message);
          }}
        />
      </div>
    );
  }

  return (
    <article className="w-full py-8 group/turn-messages">
      <div className="flex w-full flex-col justify-between gap-8">
        <div className="flex flex-1 gap-4">
          {message.persona?.name && (
            <PersonaProfileSheetTrigger
              personaId={message.persona?.id ?? null}
              userId={userId}
              label={label}
              hoverPreview
              side="right"
            >
              <AvatarWithFrame
                src={message.persona?.avatar_url ?? avatarSrc}
                alt={label ?? "User"}
                fallback={message.persona?.name ?? "?"}
                presenceState={presenceState}
                size={56}
                frameUrl={frameUrl}
              />
            </PersonaProfileSheetTrigger>
          )}
          <div className="text-sm flex flex-col w-full">
            {/* Ligne 1 : nom + boutons (réagir / éditer / supprimer) */}
            <div className="flex justify-between items-center gap-2 min-h-7">
              <strong className="font-medium">{message.persona?.name}</strong>
              <div className="flex items-center gap-1">
                {!editing && emoji_reactions && (
                  <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover/turn-messages:opacity-100 transition-opacity"
                        aria-label="Ajouter une réaction"
                        title="Réagir"
                      >
                        <SmilePlus className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="w-auto p-0 border-0 bg-transparent shadow-none"
                    >
                      <ChatReactionPicker
                        onSelect={(emoji) => {
                          void toggleReaction(emoji);
                          setPickerOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                )}

                {mine && !editing && !block && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover/turn-messages:opacity-100 transition-opacity"
                      onClick={startEdit}
                      aria-label="Modifier le message"
                      title="Modifier"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <DeleteConfirmDialog
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover/turn-messages:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          aria-label="Supprimer le message"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                      description="Ce message sera supprimé définitivement."
                      onConfirm={async () => {
                        const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
                        if (error) toast.error("Impossible de supprimer le message : " + error.message);
                        else onDeleted?.(message.id);
                      }}
                    />
                  </>
                )}
                {mine && !editing && blockRef?._type === "dice" && (
                  <DeleteConfirmDialog
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover/turn-messages:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        aria-label="Supprimer le lancé"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    }
                    description="Le lancé de dé sera supprimé définitivement."
                    onConfirm={async () => {
                      const { error } = await supabase.from(TABLE.CHAT_MESSAGES).delete().eq("id", message.id);
                      if (error) toast.error("Impossible de supprimer le lancé : " + error.message);
                    }}
                  />
                )}

                {mine && editing && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={cancelEdit}
                      disabled={saving}
                      aria-label="Annuler"
                      title="Annuler"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => void save()}
                      disabled={saving}
                      aria-label="Enregistrer"
                      title="Enregistrer"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Ligne 2 : date + note privée + réactions */}
            <div className="flex justify-between items-center gap-2 min-h-7">
              <div className="dark:text-zinc- text-zinc-400">
                <DateDisplay value={date} />
              </div>
              {!editing && emoji_reactions && reactions.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center justify-end">
                  {reactions.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      onClick={() => void toggleReaction(r.emoji)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border border-border-soft px-2 py-1 text-xs",
                        "bg-secondary hover:bg-muted",
                        r.me && "border-primary/30",
                      )}
                      aria-label={`Réaction ${r.emoji}`}
                      title={r.me ? "Retirer ma réaction" : "Ajouter ma réaction"}
                    >
                      <ReactionEmoji value={r.emoji} size={16} />
                      <span className="tabular-nums">{r.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={cn("relative flex flex-col gap-2 grow ")}>
          <div className="">
            {editing ? (
              <div className="w-full">
                <div className="rounded-2xl border bg-background/60 p-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDownEdit}
                    disabled={saving}
                    autoFocus
                    rows={Math.min(
                      10,
                      Math.max(2, (draft.match(/\n/g)?.length ?? 0) + 1),
                    )}
                    className="w-full resize-none border-0 bg-transparent px-2 py-3 shadow-none focus-visible:ring-0 text-sm leading-relaxed min-h-[44px]"
                  />
                  {err && (
                    <div className="mt-1 text-xs text-destructive">{err}</div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditBubbles((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                        editBubbles
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border-soft text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <MessageCircle className="h-3 w-3" />
                      Dialogues en bulles
                    </button>
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    Esc = annuler • Entrée = enregistrer • Ctrl+Entrée = nouvelle ligne
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {message.visible_to && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3 shrink-0" />
                    <span>
                      Note privée
                      {message.metadata?.visible_to_labels?.length
                        ? ` pour ${message.metadata.visible_to_labels.join(", ")}`
                        : ""}
                    </span>
                  </div>
                )}
                <ChatroomMessageBubble
                  persona={message.persona}
                  message={message}
                  isMine={mine}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
