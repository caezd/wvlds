"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Loader2, MessagesSquare, X } from "lucide-react";

import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { anchorPreview, type TextAnchor } from "@/lib/wikiAnnotations";
import { cn } from "@/lib/utils";
import type {
  WikiAnnotation,
  WikiAnnotationKind,
  WikiAnnotationThread,
} from "@/types/worlds";

import { WikiAnnotationComposer } from "./WikiAnnotationComposer";
import { WikiAnnotationThreadCard } from "./WikiAnnotationThreadCard";

export type AnnotationDraft = { anchor: TextAnchor; kind: WikiAnnotationKind };

type Filter = "all" | "comment" | "note";

/**
 * Colonne des annotations d'une page : commentaires et notes dans une seule
 * liste, filtrable.
 *
 * Les deux natures partagent la colonne plutôt que deux onglets séparés parce
 * qu'elles parlent du même texte, souvent du même passage — une note de
 * rédaction et la question d'un lecteur sur le même paragraphe se lisent
 * ensemble. Le filtre reste là pour qui veut ne voir que l'un des deux.
 */
export function WikiAnnotationsPanel({
  threads,
  detachedIds,
  loading,
  pending,
  activeId,
  draft,
  currentUserId,
  canModerate,
  canTakeNotes,
  onActivate,
  onCreate,
  onCancelDraft,
  onReply,
  onSetResolved,
  onDelete,
  onClose,
}: {
  threads: WikiAnnotationThread[];
  /** Fils dont l'extrait ancré a disparu du texte. */
  detachedIds: Set<string>;
  loading: boolean;
  pending: boolean;
  activeId: string | null;
  /** Sélection en attente de son premier message. */
  draft: AnnotationDraft | null;
  currentUserId: string | null;
  canModerate: boolean;
  canTakeNotes: boolean;
  onActivate: (id: string) => void;
  onCreate: (body: string) => void;
  onCancelDraft: () => void;
  onReply: (root: WikiAnnotation, body: string) => Promise<unknown>;
  onSetResolved: (root: WikiAnnotation, resolved: boolean) => void;
  onDelete: (annotation: WikiAnnotation) => void;
  onClose: () => void;
}) {
  const t = useTranslations("wiki.annotations");
  const tCommon = useTranslations("common");

  const [filter, setFilter] = React.useState<Filter>("all");
  const [showResolved, setShowResolved] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<WikiAnnotation | null>(null);

  const openCount = React.useMemo(
    () => threads.filter(th => th.root.resolved_at === null).length,
    [threads],
  );

  const visible = React.useMemo(() => {
    const kept = threads.filter(th => {
      if (filter !== "all" && th.root.kind !== filter) return false;
      if (!showResolved && th.root.resolved_at !== null) return false;
      return true;
    });

    // Ordre de lecture : les fils suivent le texte de haut en bas. Ceux dont
    // l'ancre est perdue passent à la fin — leur position n'a plus de sens.
    return kept.sort((a, b) => {
      const aLost = detachedIds.has(a.root.id);
      const bLost = detachedIds.has(b.root.id);
      if (aLost !== bLost) return aLost ? 1 : -1;
      const byPosition = (a.root.anchor_start ?? 0) - (b.root.anchor_start ?? 0);
      if (byPosition !== 0) return byPosition;
      return a.root.created_at.localeCompare(b.root.created_at);
    });
  }, [threads, filter, showResolved, detachedIds]);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: t("filterAll") },
    { id: "comment", label: t("filterComments") },
    ...(canTakeNotes ? [{ id: "note" as const, label: t("filterNotes") }] : []),
  ];

  return (
    <>
      <DeleteConfirmDialog
        open={!!confirmDelete}
        onOpenChange={open => { if (!open) setConfirmDelete(null); }}
        title={t("deleteTitle")}
        description={t("deleteDesc")}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tCommon("delete")}
        onConfirm={() => {
          if (confirmDelete) onDelete(confirmDelete);
          setConfirmDelete(null);
        }}
      />

      <aside
        aria-label={t("title")}
        className="flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-border-soft"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-3 py-2">
          <MessagesSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="flex-1 truncate text-sm font-medium">{t("title")}</h2>
          {openCount > 0 && (
            <span className="shrink-0 rounded-full bg-secondary px-1.5 text-xs text-muted-foreground">
              {openCount}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon("close")}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border-soft px-2 py-1.5">
          {filters.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full px-2 py-0.5 text-xs transition-colors",
                filter === f.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowResolved(v => !v)}
            aria-pressed={showResolved}
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-xs transition-colors",
              showResolved
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {t("showResolved")}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {draft && (
            <div className="mb-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
              <p className="mb-2 line-clamp-3 text-xs italic text-muted-foreground">
                {anchorPreview(draft.anchor.quote)}
              </p>
              <WikiAnnotationComposer
                placeholder={draft.kind === "note" ? t("notePlaceholder") : t("commentPlaceholder")}
                submitLabel={draft.kind === "note" ? t("addNote") : t("addComment")}
                pending={pending}
                onCancel={onCancelDraft}
                onSubmit={onCreate}
              />
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            !draft && (
              <p className="px-2 py-4 text-center text-xs italic text-muted-foreground">
                {threads.length === 0 ? t("empty") : t("emptyFiltered")}
              </p>
            )
          ) : (
            <ul className="space-y-2">
              {visible.map(th => (
                <WikiAnnotationThreadCard
                  key={th.root.id}
                  thread={th}
                  currentUserId={currentUserId}
                  canModerate={canModerate}
                  isActive={activeId === th.root.id}
                  isDetached={detachedIds.has(th.root.id)}
                  pending={pending}
                  onActivate={() => onActivate(th.root.id)}
                  onReply={body => onReply(th.root, body)}
                  onSetResolved={resolved => onSetResolved(th.root, resolved)}
                  onDelete={setConfirmDelete}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
