"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Anchor, Pencil, Trash2 } from "lucide-react";
import type { AnchorBlock } from "@/lib/chat-blocks";

export function AnchorBlockView({
  block,
  mine,
  onEdit,
  onDelete,
}: {
  block: AnchorBlock;
  mine: boolean;
  onEdit?: (newLabel: string) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("chatrooms");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(block.label);
  }, [block.label, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function save() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== block.label) onEdit?.(trimmed);
    setEditing(false);
  }

  function cancel() {
    setDraft(block.label);
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  }

  return (
    <div className="group/anchor relative flex items-center justify-center py-8">
      {editing ? (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/40 bg-background text-xs font-medium">
          <Anchor className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={onKeyDown}
            className="bg-transparent outline-none text-foreground min-w-0 w-32"
          />
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-background text-xs font-medium text-muted-foreground select-none">
          <Anchor className="h-3 w-3 shrink-0" />
          {block.label}
        </div>
      )}

      {mine && !editing && (onEdit || onDelete) && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/anchor:opacity-100 focus-within:opacity-100 transition-opacity">
          {onEdit && (
            <button
              type="button"
              aria-label={t("anchorEditAriaLabel")}
              title={t("anchorEditAriaLabel")}
              onClick={() => setEditing(true)}
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label={t("anchorDeleteAriaLabel")}
              title={t("anchorDeleteAriaLabel")}
              onClick={onDelete}
              className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
