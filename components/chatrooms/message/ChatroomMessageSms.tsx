"use client";

import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatroomMessageBubble } from "./ChatroomMessageBubble";
import type { ChatMessageWithPersona } from "@/types/db";

/**
 * Bulle "SMS" compacte, sans header (nom/avatar/date).
 * Regroupée visuellement par view.tsx (GameBlockSurface) quand plusieurs se
 * suivent ; `sharpTop`/`sharpBottom`/`showAvatar` sont calculés par
 * `computeSmsRunFlags` selon la position du message dans sa sous-série.
 */
export function ChatroomMessageSms({
  message,
  mine,
  label,
  avatarSrc,
  presenceState,
  frameUrl,
  sharpTop,
  sharpBottom,
  showAvatar,
  onEdit,
  onRequestDelete,
  quote,
}: {
  message: ChatMessageWithPersona;
  mine: boolean;
  label: string;
  avatarSrc?: string;
  presenceState: "online" | "away" | "offline" | "invisible";
  frameUrl: string | null;
  sharpTop: boolean;
  sharpBottom: boolean;
  showAvatar: boolean;
  onEdit: () => void;
  onRequestDelete?: () => void;
  /** Citation du message auquel celui-ci répond, rendue au-dessus de la bulle. */
  quote?: React.ReactNode;
}) {
  const tCommon = useTranslations("common");
  const avatar = showAvatar ? (
    <AvatarWithFrame
      src={message.persona?.avatar_url ?? avatarSrc}
      alt={label ?? "User"}
      fallback={message.persona?.name ?? "?"}
      presenceState={presenceState}
      size={22}
      frameUrl={frameUrl}
      circle
    />
  ) : (
    <div className="w-[22px] shrink-0" aria-hidden />
  );

  return (
    <>
    {quote && (
      <div className={cn("flex max-w-[80%]", mine ? "ml-auto justify-end" : "ml-[30px] justify-start")}>{quote}</div>
    )}
    <div
      data-message-id={message.id}
      className={cn("group/turn-messages flex items-end gap-2", mine ? "justify-end" : "justify-start")}
    >
      {mine ? (
        <>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/turn-messages:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onEdit}
              aria-label={tCommon("edit")}
              title="Modifier"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onRequestDelete}
              aria-label={tCommon("delete")}
              title="Supprimer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div
            className={cn(
              "relative rounded-xl px-3 py-0.5 text-sm sm:text-base leading-snug max-w-prose bg-muted",
              sharpTop ? "rounded-tr-xs" : "rounded-tr-xl",
              sharpBottom ? "rounded-br-xs" : "rounded-br-xl",
            )}
          >
            <ChatroomMessageBubble persona={message.persona} message={message} isMine={mine} ignoreBubbles />
          </div>
          {avatar}
        </>
      ) : (
        <>
          {avatar}
          <div
            className={cn(
              "relative rounded-xl px-3 py-0.5 text-sm sm:text-base leading-snug max-w-prose bg-muted/50",
              sharpTop ? "rounded-tl-xs" : "rounded-tl-xl",
              sharpBottom ? "rounded-bl-xs" : "rounded-bl-xl",
            )}
          >
            <ChatroomMessageBubble persona={message.persona} message={message} isMine={mine} ignoreBubbles />
          </div>
        </>
      )}
    </div>
    </>
  );
}
