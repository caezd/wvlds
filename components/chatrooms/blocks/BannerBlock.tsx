import { Trash2 } from "lucide-react";
import type { BannerBlock } from "@/lib/chat-blocks";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Button } from "@/components/ui/button";

export function BannerBlockView({
  block,
  mine,
  onDelete,
}: {
  block: BannerBlock;
  mine: boolean;
  onDelete?: () => void;
}) {
  return (
    <div className="group/banner relative w-full py-2">
      {/* dimensions intrinsèques inconnues (non stockées) — laisser le navigateur dimensionner naturellement */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.url}
        alt={block.alt ?? ""}
        className="w-full rounded-lg object-cover max-h-80"
      />
      {mine && onDelete && (
        <div className="absolute top-4 right-4 opacity-0 group-hover/banner:opacity-100 transition-opacity">
          <DeleteConfirmDialog
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7 bg-background/80 backdrop-blur-sm text-destructive hover:text-destructive hover:bg-background/90"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            }
            description="La bannière sera supprimée définitivement."
            onConfirm={onDelete}
          />
        </div>
      )}
    </div>
  );
}
