"use client";

import { useTranslations } from "next-intl";
import { copyToClipboard } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { Pencil, Pin, PinOff, MoreHorizontal, Trash2, Copy, FileText, Code, CornerUpLeft, Flag } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { afterMenuClose } from "@/components/ui/after-menu-close";
import { markdownToPlainText } from "@/lib/markdownToPlainText";

/** Menu "…" des actions sur un message (copier / modifier / épingler / supprimer). */
export function MessageActionsDropdown({
  mine,
  isPinned,
  content,
  onEdit,
  onPin,
  onUnpin,
  onRequestDelete,
  onReply,
  onReport,
}: {
  mine: boolean;
  isPinned: boolean;
  content: string;
  onEdit: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onRequestDelete?: () => void;
  /** Répondre à ce message (absent si l'on ne peut pas poster). */
  onReply?: () => void;
  /** Signaler ce message aux modérateurs (pas pour ses propres messages). */
  onReport?: () => void;
}) {
  const t = useTranslations("chatrooms");
  const tCommon = useTranslations("common");

  function copyText() {
    void copyToClipboard(markdownToPlainText(content), tCommon("copyTextSuccess"), tCommon("copyError"));
  }
  function copyMarkdown() {
    void copyToClipboard(content, tCommon("copyMarkdownSuccess"), tCommon("copyError"));
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover/turn-messages:opacity-100 focus-within:opacity-100 transition-opacity"
          aria-label={t("actions")}
          title={t("actions")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {onReply && (
          <>
            <DropdownMenuItem onClick={onReply}>
              <CornerUpLeft className="mr-2 h-3.5 w-3.5" />
              {t("reply")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger onClick={copyText} className="whitespace-nowrap">
            <Copy className="mr-2 h-3.5 w-3.5" />
            {t("copyMessage")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem onClick={copyText} className="whitespace-nowrap">
              <FileText className="mr-2 h-3.5 w-3.5" />
              {t("copyText")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={copyMarkdown} className="whitespace-nowrap">
              <Code className="mr-2 h-3.5 w-3.5" />
              {t("copyMarkdown")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {mine && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            {tCommon("edit")}
          </DropdownMenuItem>
        )}
        {isPinned ? (
          <DropdownMenuItem onClick={onUnpin}>
            <PinOff className="mr-2 h-3.5 w-3.5" />
            {t("unpin")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onPin}>
            <Pin className="mr-2 h-3.5 w-3.5" />
            {t("pin")}
          </DropdownMenuItem>
        )}
        {!mine && onReport && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={afterMenuClose(onReport)}>
              <Flag className="mr-2 h-3.5 w-3.5" />
              {t("report")}
            </DropdownMenuItem>
          </>
        )}
        {mine && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onRequestDelete && afterMenuClose(onRequestDelete)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              {tCommon("delete")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
