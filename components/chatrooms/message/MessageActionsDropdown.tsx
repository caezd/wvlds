"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pencil, Pin, PinOff, MoreHorizontal, Trash2, Copy, FileText, Code } from "lucide-react";
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
import { markdownToPlainText } from "@/lib/markdownToPlainText";

async function copyToClipboard(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("Impossible de copier dans le presse-papiers.");
  }
}

/** Menu "…" des actions sur un message (copier / modifier / épingler / supprimer). */
export function MessageActionsDropdown({
  mine,
  isPinned,
  content,
  onEdit,
  onPin,
  onUnpin,
  onRequestDelete,
}: {
  mine: boolean;
  isPinned: boolean;
  content: string;
  onEdit: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onRequestDelete?: () => void;
}) {
  const t = useTranslations("chatrooms");

  function copyText() {
    void copyToClipboard(markdownToPlainText(content), "Texte copié dans le presse-papiers.");
  }
  function copyMarkdown() {
    void copyToClipboard(content, "Markdown copié dans le presse-papiers.");
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover/turn-messages:opacity-100 transition-opacity"
          aria-label={t("actions")}
          title={t("actions")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger onClick={copyText} className="whitespace-nowrap">
            <Copy className="mr-2 h-3.5 w-3.5" />
            Copier le message
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem onClick={copyText} className="whitespace-nowrap">
              <FileText className="mr-2 h-3.5 w-3.5" />
              Copier le texte
            </DropdownMenuItem>
            <DropdownMenuItem onClick={copyMarkdown} className="whitespace-nowrap">
              <Code className="mr-2 h-3.5 w-3.5" />
              Copier le markdown
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {mine && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Modifier
          </DropdownMenuItem>
        )}
        {isPinned ? (
          <DropdownMenuItem onClick={onUnpin}>
            <PinOff className="mr-2 h-3.5 w-3.5" />
            Désépingler
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onPin}>
            <Pin className="mr-2 h-3.5 w-3.5" />
            Épingler
          </DropdownMenuItem>
        )}
        {mine && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onRequestDelete}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Supprimer
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
