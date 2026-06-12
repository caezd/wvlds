"use client";

import { Pencil, Trash2, Clock } from "lucide-react";
import type { EllipseBlock } from "@/lib/chat-blocks";
import { EllipseDialog } from "./EllipseDialog";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

export function EllipseBlockView({
  block,
  canEdit,
  onEdit,
  onDelete,
}: {
  block: EllipseBlock;
  canEdit?: boolean;
  onEdit?: (newContent: string) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group/ellipse flex items-center justify-between py-6 w-full">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground italic">
        <Clock className="h-3.5 w-3.5 shrink-0 not-italic" />
        {block.label}
      </span>

      {canEdit && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover/ellipse:opacity-100 transition-opacity">
          <EllipseDialog
            initialLabel={block.label}
            onSend={(content) => onEdit?.(content)}
            trigger={
              <Button variant="ghost" size="icon-sm" className="h-6 w-6">
                <Pencil className="h-3 w-3" />
              </Button>
            }
          />
          <DeleteConfirmDialog
            trigger={
              <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            }
            description="L'ellipse de temps sera supprimée définitivement."
            onConfirm={() => onDelete?.()}
          />
        </div>
      )}
    </div>
  );
}
