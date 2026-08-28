"use client";

import * as React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/textFormatting";
import type { CPersona, CRelation } from "./types";

export function RelationRow({
  rel, other, direction, canEdit, onDelete, onUpdateDesc, onHoverChange,
}: {
  rel: CRelation;
  other: CPersona;
  direction: "→" | "←";
  canEdit: boolean;
  onDelete: (id: string) => void;
  onUpdateDesc: (id: string, desc: string) => void;
  onHoverChange?: (id: string | null) => void;
}) {
  const t = useTranslations("relations");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(rel.description ?? "");

  function save() {
    setEditing(false);
    if (draft !== (rel.description ?? "")) onUpdateDesc(rel.id, draft);
  }

  return (
    <div
      className="group/row rounded-xl border border-border bg-card p-2.5 space-y-1.5"
      onMouseEnter={() => onHoverChange?.(rel.id)}
      onMouseLeave={() => onHoverChange?.(null)}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-muted-foreground font-mono">{direction}</span>
        {other.avatar_url
          ? <Image src={other.avatar_url} alt={other.name} width={20} height={20} className="h-5 w-5 rounded-full object-cover shrink-0" />
          : <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">{getInitials(other.name)}</div>
        }
        <span className="truncate text-[12px] font-medium flex-1">{other.name}</span>
        {canEdit && (
          <button onClick={() => onDelete(rel.id)} className="shrink-0 opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-destructive transition-opacity" aria-label={tCommon("delete")}>
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Escape") { setDraft(rel.description ?? ""); setEditing(false); } }}
          placeholder="Description (markdown)…"
          className="w-full resize-none rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-ring"
          rows={3}
        />
      ) : (
        <div
          onClick={() => canEdit && setEditing(true)}
          className={cn(
            "text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed min-h-[20px]",
            canEdit && "cursor-text hover:text-foreground transition-colors",
            !rel.description && "italic opacity-50",
          )}
        >
          {rel.description || (canEdit ? t("addDescription") : "")}
        </div>
      )}
    </div>
  );
}
