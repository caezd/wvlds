"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Library, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { toast } from "sonner";
import type { createClient } from "@/lib/supabase/client";
import type { WorldLexiconTerm } from "@/types/worlds";

function TermForm({
  worldId,
  supabase,
  initial,
  onCancel,
  onSaved,
}: {
  worldId: string;
  supabase: ReturnType<typeof createClient>;
  initial?: WorldLexiconTerm;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("wiki.lexicon");
  const tCommon = useTranslations("common");
  const [term, setTerm] = React.useState(initial?.term ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTerm = term.trim();
    const trimmedDesc = description.trim();
    if (!trimmedTerm || !trimmedDesc) return;
    setSaving(true);
    const { error } = initial
      ? await supabase
          .from("world_lexicon_terms")
          .update({ term: trimmedTerm, description: trimmedDesc })
          .eq("id", initial.id)
      : await supabase
          .from("world_lexicon_terms")
          .insert({ world_id: worldId, term: trimmedTerm, description: trimmedDesc });
    setSaving(false);
    if (error) {
      if (error.code === "23505") { toast.error(t("duplicateTerm")); return; }
      toast.error(error.message);
      return;
    }
    onSaved();
  }

  return (
    <form
      onSubmit={e => void handleSubmit(e)}
      className="space-y-2.5 rounded-xl border border-border-soft bg-muted/20 p-3"
    >
      <Input
        autoFocus
        value={term}
        onChange={e => setTerm(e.target.value)}
        placeholder={t("termPlaceholder")}
        maxLength={80}
      />
      <Textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder={t("descriptionPlaceholder")}
        rows={3}
        className="rounded-lg"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={!term.trim() || !description.trim() || saving}>
          {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          {initial ? tCommon("save") : tCommon("create")}
        </Button>
      </div>
    </form>
  );
}

function TermRow({
  term,
  isEditing,
  supabase,
  worldId,
  onEdit,
  onCancelEdit,
  onSaved,
}: {
  term: WorldLexiconTerm;
  isEditing: boolean;
  supabase: ReturnType<typeof createClient>;
  worldId: string;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("wiki.lexicon");
  const tCommon = useTranslations("common");
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    setDeleting(true);
    const { error } = await supabase.from("world_lexicon_terms").delete().eq("id", term.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    onSaved();
  }

  if (isEditing) {
    return (
      <TermForm worldId={worldId} supabase={supabase} initial={term} onCancel={onCancelEdit} onSaved={onSaved} />
    );
  }

  return (
    <div className="group flex items-start gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/40">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{term.term}</p>
        <p className="text-xs text-muted-foreground">{term.description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label={tCommon("edit")}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <DeleteConfirmDialog
          title={t("deleteTitle", { term: term.term })}
          description={t("deleteDesc")}
          cancelLabel={tCommon("cancel")}
          confirmLabel={tCommon("delete")}
          onConfirm={() => void handleDelete()}
          trigger={
            <button
              type="button"
              disabled={deleting}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              aria-label={tCommon("delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          }
        />
      </div>
    </div>
  );
}

export function WorldLexiconManager({
  open,
  onOpenChange,
  worldId,
  supabase,
  terms,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worldId: string;
  supabase: ReturnType<typeof createClient>;
  terms: WorldLexiconTerm[];
}) {
  const t = useTranslations("wiki.lexicon");
  const [creating, setCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setCreating(false);
      setEditingId(null);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border-soft">
          <SheetTitle className="flex items-center gap-2">
            <Library className="h-4 w-4" /> {t("title")}
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-3">
          <p className="px-2 pb-2 text-xs text-muted-foreground">{t("description")}</p>

          {terms.map(term => (
            <TermRow
              key={term.id}
              term={term}
              isEditing={editingId === term.id}
              supabase={supabase}
              worldId={worldId}
              onEdit={() => setEditingId(term.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          ))}

          {terms.length === 0 && !creating && (
            <p className="px-2 py-1 text-xs text-muted-foreground/60">{t("noTerms")}</p>
          )}

          {creating ? (
            <TermForm
              worldId={worldId}
              supabase={supabase}
              onCancel={() => setCreating(false)}
              onSaved={() => setCreating(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> {t("addTerm")}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
