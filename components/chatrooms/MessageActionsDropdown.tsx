"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Pencil, Pin, PinOff, MoreHorizontal, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Menu "…" des actions sur un message (modifier / épingler / supprimer). */
export function MessageActionsDropdown({
  mine,
  isPinned,
  onEdit,
  onPin,
  onUnpin,
  onRequestDelete,
}: {
  mine: boolean;
  isPinned: boolean;
  onEdit: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onRequestDelete?: () => void;
}) {
  const t = useTranslations("chatrooms");

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
      <DropdownMenuContent align="end" className="w-44">
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
