"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { encryptMessage } from "@/lib/crypto";
import type { ReactionSummary } from "@/types/db";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { ChatroomMessageBubble } from "./ChatroomMessageBubble";
import { parseChatBlock, type ChatBlock } from "@/lib/chat-blocks";
import { GameBlockRenderer } from "./blocks/GameBlockRenderer";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { extractMentions } from "@/lib/composerMessage";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

import { PersonaProfileSheetTrigger } from "@/components/personas/PersonaProfileSheetTrigger";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { ChatReactionPicker } from "./ChatReactionPicker";
import { ReactionEmoji } from "./ReactionEmoji";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { useLongPress } from "@/hooks/useLongPress";

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
  personaGroupColor,
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
  personaGroupColor?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { getUserPresence } = useGlobalPresence();

  const block = parseChatBlock(message.content ?? "") as ChatBlock | null;
  const mine = isMyMessage(message, selfId);
  const avatarSrc = online[message.author_id]?.avatar_url ?? undefined;
  const presenceState: "online" | "away" | "offline" | "invisible" = invisibleUsers?.has(message.author_id)
    ? "invisible"
    : getUserPresence(message.author_id);

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

  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { emoji_reactions } = useFeatureFlags();

  useEffect(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const hasActions = mine || !!emoji_reactions;
  const longPressHandlers = useLongPress(useCallback(() => {
    try { navigator.vibrate?.(50); } catch { /* noop */ }
    setDrawerOpen(true);
  }, []));

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

  // Blocs de jeu (dé, ellipse, bannière, scène, PNJ, alerte, météo, PV, etc.) :
  // un aiguilleur unique gère le rendu, l'édition et la suppression.
  if (block) {
    return (
      <GameBlockRenderer
        block={block}
        mine={mine}
        label={label}
        message={message}
        chatroomKey={chatroomKey}
        onUpdated={onUpdated}
      />
    );
  }

  return (
    <>
    <article
      className={cn("w-full py-8 group/turn-messages", message.visible_to && "bg-card/40 px-4")}
      {...(isMobile && hasActions ? longPressHandlers : {})}
    >
      {message.visible_to && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
          <Lock className="h-3 w-3 shrink-0" />
          <span>
            Note privée
            {message.metadata?.visible_to_labels?.length
              ? ` pour ${message.metadata.visible_to_labels.join(", ")}`
              : ""}
          </span>
        </div>
      )}
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
              <strong
                className="font-medium"
                style={personaGroupColor ? { color: personaGroupColor } : undefined}
              >
                {message.persona?.name}
              </strong>
              <div className="flex items-center gap-1">
                {!editing && !isMobile && emoji_reactions && (
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

                {mine && !editing && !isMobile && (
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

    {/* Drawer mobile — long-press sur un message */}
    <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-center">
            {message.persona?.name ?? "Options"}
          </DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col gap-1 px-4 pb-6">
          {emoji_reactions && (
            <div className="mb-2">
              <p className="text-xs text-muted-foreground mb-2 text-center">Réagir</p>
              <ChatReactionPicker
                onSelect={(emoji) => {
                  void toggleReaction(emoji);
                  setDrawerOpen(false);
                }}
              />
            </div>
          )}
          {mine && (
            <>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12 text-base"
                onClick={() => {
                  setDrawerOpen(false);
                  startEdit();
                }}
              >
                <Pencil className="h-5 w-5" />
                Modifier
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12 text-base text-destructive hover:text-destructive"
                onClick={() => {
                  setDrawerOpen(false);
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="h-5 w-5" />
                Supprimer
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>

    {/* Dialog de confirmation de suppression (déclenché depuis le drawer mobile) */}
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
          <AlertDialogDescription>
            Ce message sera supprimé définitivement.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async () => {
              const { error } = await supabase
                .from(TABLE.CHAT_MESSAGES)
                .delete()
                .eq("id", message.id);
              if (error) toast.error("Impossible de supprimer le message : " + error.message);
              else onDeleted?.(message.id);
            }}
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
