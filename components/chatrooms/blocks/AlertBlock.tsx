"use client";

import { useState } from "react";
import { Megaphone, Pencil, Trash2 } from "lucide-react";
import type { AlertBlock } from "@/lib/chat-blocks";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SEVERITIES: { value: AlertBlock["severity"]; label: string; activeClass: string }[] = [
  { value: "danger",  label: "Danger",    activeClass: "border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-400" },
  { value: "warning", label: "Attention", activeClass: "border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { value: "success", label: "Succès",    activeClass: "border-teal-500/60 bg-teal-500/10 text-teal-600 dark:text-teal-400" },
];

const BORDER_L: Record<AlertBlock["severity"], string> = {
  danger:  "border-l-red-500",
  warning: "border-l-amber-500",
  success: "border-l-teal-500",
};

const TAG_COLOR: Record<AlertBlock["severity"], string> = {
  danger:  "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  success: "text-teal-600 dark:text-teal-400",
};

export function AlertDialog({
  onSend,
  initialBlock,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  onSend: (content: string) => void;
  initialBlock?: AlertBlock;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [severity, setSeverity] = useState<AlertBlock["severity"]>(initialBlock?.severity ?? "danger");
  const [tag, setTag] = useState(initialBlock?.tag ?? "");
  const [text, setText] = useState(initialBlock?.text ?? "");

  function handleOpen(v: boolean) {
    if (v) {
      setSeverity(initialBlock?.severity ?? "danger");
      setTag(initialBlock?.tag ?? "");
      setText(initialBlock?.text ?? "");
    }
    setOpen(v);
  }

  function handleSend() {
    const trimmedTag = tag.trim();
    if (!trimmedTag) return;
    const block: Record<string, string> = { _type: "alert", severity, tag: trimmedTag };
    if (text.trim()) block.text = text.trim();
    onSend(JSON.stringify(block));
    setOpen(false);
    if (!initialBlock) { setSeverity("danger"); setTag(""); setText(""); }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {!onOpenChange && trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Alerte narrative
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <div className="flex gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeverity(s.value)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                    severity === s.value
                      ? s.activeClass
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Titre <span className="text-destructive">*</span>
            </Label>
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="ex. Mort d'un personnage, Victoire…"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description (optionnel)</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Décrivez l'événement…"
              rows={3}
              className="resize-none"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend(); }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={handleSend} disabled={!tag.trim()}>
            {initialBlock ? "Enregistrer" : "Insérer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AlertBlockView({
  block,
  mine,
  onEdit,
  onDelete,
}: {
  block: AlertBlock;
  mine: boolean;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
}) {
  return (
    <div className={cn(
      "group/alert w-full rounded-xl border border-border-soft border-l-4 bg-card px-4 py-3",
      BORDER_L[block.severity],
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("text-[10px] font-semibold uppercase tracking-widest", TAG_COLOR[block.severity])}>
            {block.tag}
          </p>
          {block.text && (
            <p className="mt-1 text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {block.text}
            </p>
          )}
        </div>
        {mine && (
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/alert:opacity-100 transition-opacity">
            {onEdit && (
              <AlertDialog
                initialBlock={block}
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
                  <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                }
                description="L'alerte sera supprimée définitivement."
                onConfirm={onDelete}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
