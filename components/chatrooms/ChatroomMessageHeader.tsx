"use client";

import { useTranslations } from "next-intl";
import type { ReactionSummary, ChallengeBadge, ChatMessageWithPersona } from "@/types/db";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, X, Loader2, SmilePlus, Dices } from "lucide-react";
import DateDisplay from "@/components/date-display";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { PersonaProfileSheetTrigger } from "@/components/personas/PersonaProfileSheetTrigger";
import { UserProfileSheetTrigger } from "@/components/profile/UserProfileSheetTrigger";
import { ChatReactionPicker } from "./ChatReactionPicker";
import { ReactionEmoji } from "./ReactionEmoji";
import { MessageActionsDropdown } from "./MessageActionsDropdown";
import { cn } from "@/lib/utils";

/**
 * Avatar + nom + actions (réagir / éditer-supprimer / annuler-enregistrer) et
 * date + badge défi + réactions d'un message normal (hors bloc/SMS).
 */
export function ChatroomMessageHeader({
  message,
  mine,
  editing,
  saving,
  personaGroupColor,
  avatarSrc,
  presenceState,
  frameUrl,
  label,
  userId,
  playerUsername,
  date,
  challengeWon,
  pinId,
  onPin,
  onUnpin,
  onRequestDelete,
  startEdit,
  cancelEdit,
  save,
  emojiReactions,
  isMobile,
  reactions,
  toggleReaction,
  pickerOpen,
  setPickerOpen,
}: {
  message: ChatMessageWithPersona;
  mine: boolean;
  editing: boolean;
  saving: boolean;
  personaGroupColor?: string | null;
  avatarSrc?: string;
  presenceState: "online" | "away" | "offline" | "invisible";
  frameUrl: string | null;
  label: string;
  userId: string | null;
  playerUsername: string | null;
  date: string;
  challengeWon?: ChallengeBadge | null;
  pinId?: string | null;
  onPin?: (messageId: number) => void;
  onUnpin?: (pinId: string) => void;
  onRequestDelete?: () => void;
  startEdit: () => void;
  cancelEdit: () => void;
  save: () => void | Promise<void>;
  emojiReactions?: boolean;
  isMobile: boolean;
  reactions: ReactionSummary[];
  toggleReaction: (emoteKey: string) => void | Promise<void>;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
}) {
  const t = useTranslations("chatrooms");

  return (
    <div className="flex flex-1 gap-4">
      {message.persona?.name && (
        <div className="group/avatar shrink-0 flex items-start">
          {/* Avatar joueur — lg uniquement.
              w-0 = pas de place réservée dans le flex ; l'avatar
              déborde vers la droite via translate sans sortir du scroll area. */}
          <div className="hidden lg:block w-0 shrink-0 self-start relative">
            <UserProfileSheetTrigger userId={userId} label={playerUsername}>
              <div className="flex absolute right-0 opacity-0 group-hover/avatar:opacity-100 group-hover/avatar:translate-x-3 transition-all duration-200 ease-out focus:opacity-100 focus:translate-x-3">
                <Avatar className="size-14 ring-2 ring-background rounded-full">
                  {avatarSrc && <AvatarImage src={avatarSrc} className="rounded-full" />}
                  <AvatarFallback className="text-base rounded-full">
                    {(playerUsername ?? "?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
            </UserProfileSheetTrigger>
          </div>

          <PersonaProfileSheetTrigger
            personaId={message.persona?.id ?? null}
            userId={userId}
            label={label}
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
        </div>
      )}
      <div className="text-sm flex flex-col w-full">
        {/* Ligne 1 : nom + boutons (réagir / éditer / supprimer) */}
        <div className="flex justify-between items-center gap-2 min-h-7">
          <div className="flex items-center gap-1 text-mist-50">
            <strong
              className="font-medium"
              style={personaGroupColor ? { color: personaGroupColor } : undefined}
            >
              {message.persona?.name}
            </strong>
            <span className="text-mist-200 text-xs">
              (@{(message.author?.username ?? playerUsername ?? "?").toLowerCase()})
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!editing && !isMobile && emojiReactions && (
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover/turn-messages:opacity-100 transition-opacity"
                    aria-label={t("addReaction")}
                    title={t("addReaction")}
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

            {!editing && !isMobile && (mine || onPin) && (
              <MessageActionsDropdown
                mine={mine}
                isPinned={!!pinId}
                onEdit={startEdit}
                onPin={onPin ? () => onPin(message.id) : undefined}
                onUnpin={pinId && onUnpin ? () => onUnpin(pinId) : undefined}
                onRequestDelete={onRequestDelete}
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
                  aria-label={t("cancelEdit")}
                  title={t("cancelEdit")}
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
                  aria-label={t("saveEdit")}
                  title={t("saveEdit")}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Ligne 2 : date + badge défi + réactions */}
        <div className="flex justify-between items-center gap-2 min-h-7">
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <DateDisplay value={date} />
            {challengeWon && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-[0.65rem] text-amber-500 cursor-default select-none">
                    <Dices className="h-3 w-3 shrink-0" />
                    a remporté un défi
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64">
                  <p className="font-medium mb-0.5">{challengeWon.title}</p>
                  {challengeWon.description && (
                    <MarkdownRenderer
                      content={challengeWon.description}
                      proseSize="sm"
                      className="text-popover-foreground/70 leading-snug"
                    />
                  )}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {!editing && emojiReactions && reactions.length > 0 && (
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
  );
}
