"use client";

import { useEffect, useState, useCallback, useMemo, memo } from "react";
import { useTranslations } from "next-intl";
import type { ReactionSummary } from "@/types/db";
import { ChatroomMessageBubble } from "./ChatroomMessageBubble";
import { ChatroomMessageSms } from "./ChatroomMessageSms";
import { ChatroomMessageHeader } from "./ChatroomMessageHeader";
import { ChatroomMessageMobileDrawers } from "./ChatroomMessageMobileDrawers";
import { useChatroomMessageEdit } from "../composer/useChatroomMessageEdit";
import { ContentWarningChipInput } from "../composer/ContentWarningChipInput";
import { ContentWarningBanner } from "../composer/ContentWarningBanner";
import { parseChatBlock, type ChatBlock } from "@/lib/chat-blocks";
import { GameBlockRenderer } from "../blocks/GameBlockRenderer";
import { cn } from "@/lib/utils";
import { ParagraphBlockEditor } from "../composer/ParagraphBlockEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HsvColorPicker } from "@/components/ui/hsv-color-picker";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";

import { MessageCircle, MessageSquareText, Lock, Pin, Pipette, AlertTriangle } from "lucide-react";
import type { ChallengeBadge, ChatMessageMeta } from "@/types/db";

import { toast } from "sonner";

import { useGlobalPresence } from "@/components/providers/PresenceProvider";
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


function ChatroomMessage({
  message,
  online,
  invisibleUsers,
  selfId,
  onUpdated,
  onRequestDelete,
  onReactionsUpdated,
  onVotesUpdated,
  chatroomKey,
  forceEdit,
  onForceEditConsumed,
  personaGroupColor,
  pinId,
  onPin,
  onUnpin,
  onAnchorEdited,
  challengeWon,
  smsSharpTop,
  smsSharpBottom,
  smsShowAvatar,
}: {
  message: import("@/types/db").ChatMessageWithPersona;
  online: Record<string, { avatar_url?: string | null; username?: string | null }>;
  invisibleUsers?: Set<string>;
  selfId: string | null;
  onUpdated?: (id: number, content: string, metadata: ChatMessageMeta | null) => void;
  onRequestDelete?: () => void;
  onReactionsUpdated?: (id: number, reactions: ReactionSummary[]) => void;
  onVotesUpdated?: (id: number, votes: import("@/types/db").ChoiceVoteSummary[]) => void;
  chatroomKey?: string | null;
  forceEdit?: boolean;
  onForceEditConsumed?: () => void;
  personaGroupColor?: string | null;
  /** ID de l'épingle si ce message est épinglé, null sinon. */
  pinId?: string | null;
  onPin?: (messageId: number) => void;
  onUnpin?: (pinId: string) => void;
  onAnchorEdited?: (messageId: number, label: string) => void;
  challengeWon?: ChallengeBadge | null;
  /** Position dans une sous-série "SMS" du même auteur (calculée par view.tsx). */
  smsSharpTop?: boolean;
  smsSharpBottom?: boolean;
  smsShowAvatar?: boolean;
}) {
  const t = useTranslations("chatrooms");
  const supabase = useMemo(() => createClient(), []);
  const { getUserPresence } = useGlobalPresence();

  const block = parseChatBlock(message.content ?? "") as ChatBlock | null;
  const mine = isMyMessage(message, selfId);
  const playerAvatarSrc = message.author?.avatar_url ?? online[message.author_id]?.avatar_url ?? undefined;
  const playerUsername = message.author?.username ?? online[message.author_id]?.username ?? null;
  const avatarSrc = playerAvatarSrc;
  const presenceState: "online" | "away" | "offline" | "invisible" = invisibleUsers?.has(message.author_id)
    ? "invisible"
    : getUserPresence(message.author_id);

  const date = message.created_at;

  const userId = message.author_id ?? message.persona?.user_id ?? null;
  const label =
    message.persona?.name ??
    playerUsername ??
    "Profil";

  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [editColorPickerOpen, setEditColorPickerOpen] = useState(false);
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

  const {
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
  } = useChatroomMessageEdit({ message, mine, selfId, online, chatroomKey, onUpdated, forceEdit, onForceEditConsumed });

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
      <div data-message-id={message.id}>
        <GameBlockRenderer
          block={block}
          mine={mine}
          label={label}
          message={message}
          chatroomKey={chatroomKey}
          onUpdated={onUpdated}
          onAnchorEdited={onAnchorEdited}
          votes={message.votes}
          onVotesUpdated={onVotesUpdated}
        />
      </div>
    );
  }

  // Messages "SMS" : bulle compacte, sans header (nom/avatar/date). Les
  // avertissements de contenu du bloc SMS entier sont agrégés et affichés
  // une seule fois en tête du bloc par la vue parente (voir view.tsx /
  // aggregateContentWarnings), pas ici par message.
  if (message.metadata?.sms && !editing) {
    return (
      <ChatroomMessageSms
        message={message}
        mine={mine}
        label={label}
        avatarSrc={avatarSrc}
        presenceState={presenceState}
        frameUrl={frameUrl}
        sharpTop={smsSharpTop ?? false}
        sharpBottom={smsSharpBottom ?? false}
        showAvatar={smsShowAvatar ?? true}
        onEdit={startEdit}
        onRequestDelete={onRequestDelete}
      />
    );
  }

  return (
    <>
      <article
        data-message-id={message.id}
        className={cn("w-full py-8 group/turn-messages px-2", message.visible_to && "bg-card/40 px-4")}
        {...(isMobile && hasActions ? longPressHandlers : {})}
      >
        {pinId && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Pin className="h-3 w-3 shrink-0" />
            <span>{t("pinned")}</span>
          </div>
        )}
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
        <ContentWarningBanner tags={message.metadata?.content_warnings ?? []} className="mb-3" />
        <div className="flex w-full flex-col justify-between gap-8 ">
          <ChatroomMessageHeader
            message={message}
            mine={mine}
            editing={editing}
            saving={saving}
            personaGroupColor={personaGroupColor}
            avatarSrc={avatarSrc}
            presenceState={presenceState}
            frameUrl={frameUrl}
            label={label}
            userId={userId}
            playerUsername={playerUsername}
            date={date}
            challengeWon={challengeWon}
            pinId={pinId}
            onPin={onPin}
            onUnpin={onUnpin}
            onRequestDelete={onRequestDelete}
            startEdit={startEdit}
            cancelEdit={cancelEdit}
            save={save}
            emojiReactions={emoji_reactions}
            isMobile={isMobile}
            reactions={reactions}
            toggleReaction={toggleReaction}
            pickerOpen={pickerOpen}
            setPickerOpen={setPickerOpen}
          />

          <div className={cn("relative flex flex-col gap-2 grow")}>
            <div className="">
              {editing ? (
                <div className="w-full">
                  <div className="rounded-2xl border bg-background/60 p-2">
                    <ParagraphBlockEditor
                      value={draft}
                      onChange={setDraft}
                      onKeyDown={onKeyDownEdit}
                      disabled={saving}
                      autoFocus
                      formatting
                      invertEnter={isMobile}
                      className="px-2 py-3 leading-relaxed min-h-[44px]"
                      wrapperClassName="max-h-none"
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
                      {editBubbles && (
                        <button
                          type="button"
                          onClick={() => setEditColorPickerOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border-soft px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <span
                            className="size-3 shrink-0 rounded-full border border-border/60"
                            style={editBubbleColor ? { backgroundColor: editBubbleColor } : undefined}
                          >
                            {!editBubbleColor && <Pipette className="m-auto size-2.5 text-muted-foreground" />}
                          </span>
                          {t("colorChoose")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditSms((v) => !v)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                          editSms
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border-soft text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <MessageSquareText className="h-3 w-3" />
                        {t("smsMode")}
                      </button>
                      <button
                        type="button"
                        onClick={contentWarningsChips.toggle}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                          contentWarningsChips.tags !== null
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "border-border-soft text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {t("contentWarning")}
                      </button>
                    </div>
                    {contentWarningsChips.tags !== null && (
                      <ContentWarningChipInput
                        tags={contentWarningsChips.tags}
                        input={contentWarningsChips.input}
                        onInputChange={contentWarningsChips.setInput}
                        onKeyDown={contentWarningsChips.onKeyDown}
                        onBlur={() => contentWarningsChips.add(contentWarningsChips.input)}
                        onRemove={contentWarningsChips.remove}
                        onDisable={contentWarningsChips.toggle}
                        placeholder={t("contentWarningPlaceholder")}
                        className="mt-2"
                      />
                    )}
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

      <ChatroomMessageMobileDrawers
        personaName={message.persona?.name}
        mine={mine}
        emojiReactions={emoji_reactions}
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        emojiPickerOpen={emojiPickerOpen}
        setEmojiPickerOpen={setEmojiPickerOpen}
        startEdit={startEdit}
        onRequestDelete={onRequestDelete}
        toggleReaction={toggleReaction}
      />

      <Dialog open={editColorPickerOpen} onOpenChange={setEditColorPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("dialogColorTitle")}</DialogTitle>
          </DialogHeader>
          <HsvColorPicker
            color={editBubbleColor ?? "#1d4ed8"}
            onChange={setEditBubbleColor}
          />
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <button
              type="button"
              onClick={() => setEditBubbleColor(null)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("colorReset")}
            </button>
            <Button size="sm" onClick={() => setEditColorPickerOpen(false)}>
              {t("colorConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default memo(ChatroomMessage);
