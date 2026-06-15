import { Clock, Pencil, Trash2 } from "lucide-react";
import type { FlashbackBlock } from "@/lib/chat-blocks";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import { NarrativeBlockDialog } from "./NarrativeBlockDialog";

export function FlashbackBlockView({
  block,
  mine,
  onEdit,
  onDelete,
}: {
  block: FlashbackBlock;
  mine: boolean;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group/flashback w-full rounded-xl border border-amber-800/30 bg-amber-950/10 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400/70">
        <Clock className="h-3 w-3 shrink-0" />
        <span className="font-medium">{block.when ?? "Souvenir"}</span>
      </div>
      <p className="text-sm italic leading-relaxed text-foreground/70 whitespace-pre-wrap">
        {block.text}
      </p>
      {mine && (
        <div className="mt-2 flex items-center gap-1 opacity-0 group-hover/flashback:opacity-100 transition-opacity">
          {onEdit && (
            <NarrativeBlockDialog
              blockType="flashback"
              initialText={block.text}
              initialExtra={block.when}
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
              description="Le flashback sera supprimé définitivement."
              onConfirm={onDelete}
            />
          )}
        </div>
      )}
    </div>
  );
}
