"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, GripVertical, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { AutoResizeTextarea } from "@/components/ui/auto-resizable-textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { DB_TEXT_LIMITS } from "@/lib/textLimits";
import { cn } from "@/lib/utils";
import type { WikiPageNote } from "@/types/worlds";

/**
 * Échelle de texte du contenu d'une fiche.
 *
 * `MarkdownRenderer` monte en `prose-sm sm:prose-base` : au-delà de 640 px, le
 * corps d'une fiche s'affichait donc à 16 px, plus GROS que le titre qui le
 * surplombe (14 px) — et bien plus gros que tout ce qui l'entoure dans une
 * colonne de 288 px. On redescend le corps à 12 px et on subordonne les titres
 * markdown au titre de la fiche.
 *
 * Les sélecteurs visent les éléments (`[&_p]`) plutôt que le conteneur : les
 * règles du plugin Typography sont enveloppées en `:where()`, de spécificité
 * nulle, précisément pour rester surchargeables ainsi. Agir sur le conteneur
 * reviendrait à disputer une classe à une autre classe, où seul l'ordre des
 * déclarations trancherait.
 */
const NOTE_PROSE_CLASSES = cn(
  "[&_p]:text-xs [&_li]:text-xs [&_blockquote]:text-xs",
  "[&_td]:text-xs [&_th]:text-xs [&_code]:text-[11px]",
  "[&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_h4]:text-xs [&_h5]:text-xs [&_h6]:text-xs",
  "[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold",
  // À 12 px, les marges de `prose-base` laissent des trous : on resserre.
  "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:mt-2 [&_h2]:mb-1",
);

/** Identifiant de glissement d'une fiche — préfixé pour le distinguer d'une catégorie. */
export const noteDragId = (id: string) => `note:${id}`;

/**
 * Une fiche du panneau de notes : un titre qui déplie son contenu, et, en mode
 * modification, une poignée de déplacement et un menu.
 */
export function WikiNoteCard({
  note,
  canEdit,
  expanded,
  onToggleExpanded,
  onSave,
  onDelete,
}: {
  note: WikiPageNote;
  canEdit: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSave: (patch: { title: string; body: string }) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("wiki.notes");
  const tCommon = useTranslations("common");

  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(note.title);
  const [body, setBody] = React.useState(note.body);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: noteDragId(note.id),
    disabled: !canEdit || editing,
  });

  function startEditing() {
    setTitle(note.title);
    setBody(note.body);
    setEditing(true);
  }

  function save() {
    if (!title.trim()) return;
    onSave({ title: title.trim(), body });
    setEditing(false);
  }

  if (editing) {
    return (
      <li
        ref={setNodeRef}
        className="rounded-lg border border-primary/40 bg-background p-2"
        style={{ transform: CSS.Transform.toString(transform), transition }}
      >
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={DB_TEXT_LIMITS["world_wiki_page_notes.title"]}
          placeholder={t("titlePlaceholder")}
          className="w-full border-b border-border-soft bg-transparent pb-1 text-sm font-medium outline-none focus:border-primary/50"
          autoFocus
          onKeyDown={e => {
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          }}
        />
        <AutoResizeTextarea
          value={body}
          onChange={e => setBody(e.target.value)}
          maxLength={DB_TEXT_LIMITS["world_wiki_page_notes.body"]}
          placeholder={t("bodyPlaceholder")}
          minRows={3}
          maxRows={14}
          className="mt-2 w-full resize-none rounded-md border border-border-soft bg-transparent px-2 py-1.5 text-xs outline-none focus:border-primary/50"
          onKeyDown={e => {
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          }}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>
            {tCommon("cancel")}
          </Button>
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={save} disabled={!title.trim()}>
            {tCommon("save")}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/note rounded-lg border border-border-soft bg-background",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        {canEdit && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t("reorder")}
            className="shrink-0 cursor-grab text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/note:opacity-100"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          />
          <span className="truncate text-sm">{note.title}</span>
        </button>

        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("noteActions")}
                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 group-hover/note:opacity-100"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={startEditing}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> {tCommon("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> {tCommon("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border-soft px-2.5 py-2">
          {note.body.trim()
            ? <MarkdownRenderer content={note.body} className={NOTE_PROSE_CLASSES} />
            : <p className="text-xs italic text-muted-foreground">{t("emptyBody")}</p>}
        </div>
      )}
    </li>
  );
}
