"use client";

import { useState } from "react";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import type { RevealBlock } from "@/lib/chat-blocks";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import { NarrativeBlockDialog } from "./NarrativeBlockDialog";
import MarkdownRenderer from "@/components/MarkdownRenderer";

export function RevealBlockView({
  block,
  mine,
  onEdit,
  onDelete,
}: {
  block: RevealBlock;
  mine: boolean;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="group/reveal w-full rounded-xl border border-border-soft bg-card overflow-hidden">
      {/* Ligne toggle + boutons edit/delete alignés à droite */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {revealed ? (
            <>
              <EyeOff className="h-3.5 w-3.5 shrink-0" />
              Masquer
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5 shrink-0" />
              {block.hint ?? "Cliquer pour révéler"}
            </>
          )}
        </button>
        {mine && (
          <div className="flex items-center gap-0.5 pr-2 opacity-0 group-hover/reveal:opacity-100 transition-opacity">
            {onEdit && (
              <NarrativeBlockDialog
                blockType="reveal"
                initialText={block.text}
                initialExtra={block.hint}
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                }
                description="La révélation sera supprimée définitivement."
                onConfirm={onDelete}
              />
            )}
          </div>
        )}
      </div>

      {revealed && (
        <div className="border-t border-border-soft px-4 py-3">
          <MarkdownRenderer content={block.text} proseSize="sm" />
        </div>
      )}
    </div>
  );
}
