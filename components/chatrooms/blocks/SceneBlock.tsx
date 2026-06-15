import { Pencil, Trash2 } from "lucide-react";
import type { SceneBlock } from "@/lib/chat-blocks";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import { NarrativeBlockDialog } from "./NarrativeBlockDialog";

export function SceneBlockView({
  block,
  mine,
  onEdit,
  onDelete,
}: {
  block: SceneBlock;
  mine: boolean;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group/scene w-full py-6">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          {block.label ?? "Scène"}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <p className="mt-4 text-center text-sm italic leading-relaxed text-foreground/80 whitespace-pre-wrap">
        {block.text}
      </p>
      {mine && (
        <div className="mt-3 flex items-center justify-center gap-1 opacity-0 group-hover/scene:opacity-100 transition-opacity">
          {onEdit && (
            <NarrativeBlockDialog
              blockType="scene"
              initialText={block.text}
              initialExtra={block.label}
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
              description="La scène sera supprimée définitivement."
              onConfirm={onDelete}
            />
          )}
        </div>
      )}
    </div>
  );
}
