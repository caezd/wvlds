"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { AutoResizeTextarea } from "@/components/ui/auto-resizable-textarea";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Affiche le contenu markdown d'un onglet de monde, avec édition
 * inline pour les admins (textarea + sauvegarde dans world_content_tabs.content).
 */
export function WorldTabContent({
  tabId,
  initialContent,
  canEdit = false,
}: {
  tabId: string;
  initialContent: string | null;
  canEdit?: boolean;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [content, setContent] = React.useState(initialContent ?? "");
  const [draft, setDraft] = React.useState(initialContent ?? "");
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("world_content_tabs")
      .update({ content: draft })
      .eq("id", tabId);
    setSaving(false);

    if (error) {
      toast.error("Sauvegarde impossible.", { description: error.message });
      return;
    }
    setContent(draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="bg-card-400 rounded-2xl p-4">
          <AutoResizeTextarea
            value={draft}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setDraft(e.target.value)
            }
            placeholder="Décris ton monde en Markdown…"
            className="outline-0 resize-none w-full bg-transparent"
            minRows={6}
            maxRows={24}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(content);
              setEditing(false);
            }}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/tabcontent relative">
      {content.trim() ? (
        <MarkdownRenderer content={content} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? "Cet onglet est vide. Ajoute du contenu pour décrire ton monde."
            : "Cet onglet est vide pour le moment."}
        </p>
      )}
      {canEdit && (
        <Button
          variant="secondary"
          size="icon-sm"
          onClick={() => {
            setDraft(content);
            setEditing(true);
          }}
          aria-label="Modifier le contenu"
          className="absolute -top-1 -right-1 opacity-0 group-hover/tabcontent:opacity-100 transition-opacity"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
