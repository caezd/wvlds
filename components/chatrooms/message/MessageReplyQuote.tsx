"use client";

import { useTranslations } from "next-intl";
import type { ChatMessageReplyRef } from "@/types/db";
import { replyAuthorLabel, replyExcerpt } from "@/lib/replyExcerpt";

/**
 * Citation du message auquel un message répond : auteur et extrait, cliquable
 * pour remonter jusqu'à lui (il est chargé au besoin, cf. scrollToMessage).
 * Un message cité supprimé, ou illisible pour ce lecteur (note privée), reste
 * signalé sans rien en révéler.
 *
 * Une ligne discrète, sans encadré : un coude relie la citation au message
 * en dessous, l'auteur en gras, l'extrait en gris.
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
      <div className="mb-1 flex items-start gap-1.5 text-xs italic text-muted-foreground" data-testid="reply-quote">
        <ReplyElbow />
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
      className="group/reply mb-1 flex w-full min-w-0 items-start gap-1.5 text-left text-xs text-muted-foreground"
      data-testid="reply-quote"
      aria-label={t("replyJumpTo", { author: auteur })}
    >
      <ReplyElbow />
      <span className="shrink-0 font-medium text-foreground group-hover/reply:underline">{auteur}</span>
      <span className="truncate transition-colors group-hover/reply:text-foreground">{extrait}</span>
    </button>
  );
}

/** Le coude qui descend de la citation vers le message qui lui répond. */
function ReplyElbow() {
  return <span aria-hidden className="mt-2 ml-1 h-2.5 w-4 shrink-0 rounded-tl-md border-t-2 border-l-2 border-muted-foreground/40" />;
}
