"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { RevealBlock } from "@/lib/chat-blocks";
import { NarrativeBlockDialog } from "./NarrativeBlockDialog";
import { GameBlockToolbar, GameBlockEditButton } from "./GameBlockShell";
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
    <div className="group/gblock w-full rounded-xl border border-border-soft bg-card overflow-hidden">
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
        <GameBlockToolbar
          mine={mine}
          className="pr-2"
          editDialog={
            onEdit && (
              <NarrativeBlockDialog
                blockType="reveal"
                initialText={block.text}
                initialExtra={block.hint}
                onSend={onEdit}
                trigger={<GameBlockEditButton />}
              />
            )
          }
          onDelete={onDelete}
          deleteDescription="La révélation sera supprimée définitivement."
        />
      </div>

      {revealed && (
        <div className="border-t border-border-soft px-4 py-3">
          <MarkdownRenderer content={block.text} proseSize="sm" />
        </div>
      )}
    </div>
  );
}
