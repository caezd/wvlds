"use client";

import { useTranslations } from "next-intl";
import { CornerUpLeft } from "lucide-react";
import type { ChatMessageReplyRef } from "@/types/db";
import { replyAuthorLabel, replyExcerpt } from "@/lib/replyExcerpt";

/**
 * Citation du message auquel un message répond : auteur et extrait, cliquable
 * pour remonter jusqu'à lui (il est chargé au besoin, cf. scrollToMessage).
 * Un message cité supprimé, ou illisible pour ce lecteur (note privée), reste
 * signalé sans rien en révéler.
 */
export function MessageReplyQuote({
  replyToId,
  replyTo,
  onJump,
}: {
  replyToId: number;
  replyTo: ChatMessageReplyRef | null | undefined;
  onJump?: (messageId: number) => void;
}) {
  const t = useTranslations("chatrooms");

  if (!replyTo) {
    return (
      <div className="mb-2 flex items-center gap-1.5 text-xs italic text-muted-foreground" data-testid="reply-quote">
        <CornerUpLeft className="h-3 w-3 shrink-0" />
        {t("replyUnavailable")}
      </div>
    );
  }

  const auteur = replyAuthorLabel(replyTo) ?? t("replyUnknownAuthor");
  const extrait = replyExcerpt(replyTo.content) ?? t("replyBlock");

  return (
    <button
      type="button"
      onClick={() => onJump?.(replyToId)}
      className="mb-2 flex w-full min-w-0 items-center gap-1.5 rounded-md border-l-2 border-primary/50 bg-muted/40 px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/70"
      data-testid="reply-quote"
      aria-label={t("replyJumpTo", { author: auteur })}
    >
      <CornerUpLeft className="h-3 w-3 shrink-0" />
      <span className="shrink-0 font-medium text-foreground">{auteur}</span>
      <span className="truncate">{extrait}</span>
    </button>
  );
}
