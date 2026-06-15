"use client";

import { Quote, Pencil, Trash2 } from "lucide-react";
import type { WhisperBlock } from "@/lib/chat-blocks";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import { NarrativeBlockDialog } from "./NarrativeBlockDialog";

export function WhisperBlockView({
  block,
  mine,
  onEdit,
  onDelete,
}: {
  block: WhisperBlock;
  mine: boolean;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group/whisper w-full rounded-xl border border-border-soft bg-muted/40 px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Quote className="h-3 w-3 shrink-0" />
        <span className="font-medium uppercase tracking-wide text-[10px]">Aparté</span>
      </div>
      <p className="text-sm italic leading-relaxed text-muted-foreground whitespace-pre-wrap">
        {block.text}
      </p>
      {mine && (
        <div className="mt-2 flex items-center gap-1 opacity-0 group-hover/whisper:opacity-100 transition-opacity">
          {onEdit && (
            <NarrativeBlockDialog
              blockType="whisper"
              initialText={block.text}
              onSend={onEdit}
              trigger={
                <Button variant="ghost" size="icon-sm" className="h-6 w-6">
                  <Pencil className="h-3 w-3" />
                </Button>
              }
            />
          )}
          {onDelete && (
            <DeleteConfirmDialog
              trigger={
                <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-destructive hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </Button>
              }
              description="L'aparté sera supprimé définitivement."
              onConfirm={onDelete}
            />
          )}
        </div>
      )}
    </div>
  );
}
