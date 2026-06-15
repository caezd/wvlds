"use client";

import { useState } from "react";
import { Cloud, Pencil, Trash2 } from "lucide-react";
import type { WeatherBlock } from "@/lib/chat-blocks";
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
import { EmojiPickerButton } from "@/components/chatrooms/EmojiPickerButton";

const PRESETS = [
  { icon: "☀️", label: "Beau temps" },
  { icon: "🌤️", label: "Nuageux" },
  { icon: "🌧️", label: "Pluie" },
  { icon: "⛈️", label: "Orage" },
  { icon: "❄️", label: "Neige" },
  { icon: "🌫️", label: "Brouillard" },
  { icon: "🌙", label: "Nuit calme" },
  { icon: "🔥", label: "Chaleur intense" },
];

export function WeatherDialog({
  onSend,
  initialBlock,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  onSend: (content: string) => void;
  initialBlock?: WeatherBlock;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [icon, setIcon] = useState(initialBlock?.icon ?? "");
  const [label, setLabel] = useState(initialBlock?.label ?? "");
  const [note, setNote] = useState(initialBlock?.note ?? "");

  function handleOpen(v: boolean) {
    if (v) {
      setIcon(initialBlock?.icon ?? "");
      setLabel(initialBlock?.label ?? "");
      setNote(initialBlock?.note ?? "");
    }
    setOpen(v);
  }

  function applyPreset(preset: { icon: string; label: string }) {
    setIcon(preset.icon);
    if (!label) setLabel(preset.label);
  }

  function handleSend() {
    const trimmedLabel = label.trim();
    const trimmedIcon = icon.trim();
    if (!trimmedLabel || !trimmedIcon) return;
    const block: Record<string, string> = { _type: "weather", icon: trimmedIcon, label: trimmedLabel };
    if (note.trim()) block.note = note.trim();
    onSend(JSON.stringify(block));
    setOpen(false);
    if (!initialBlock) { setIcon(""); setLabel(""); setNote(""); }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {!onOpenChange && trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Météo et ambiance
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Préréglages</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.icon}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="space-y-1.5 w-16">
              <Label className="text-xs text-muted-foreground">
                Icône <span className="text-destructive">*</span>
              </Label>
              <EmojiPickerButton value={icon} onChange={setIcon} />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">
                Ambiance <span className="text-destructive">*</span>
              </Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ex. Pluie battante"
                autoFocus
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Note (optionnel)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex. −1 aux jets de Perception"
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={handleSend} disabled={!label.trim() || !icon.trim()}>
            {initialBlock ? "Enregistrer" : "Insérer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WeatherBlockView({
  block,
  mine,
  onEdit,
  onDelete,
}: {
  block: WeatherBlock;
  mine: boolean;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group/weather w-full rounded-xl border border-border-soft bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl shrink-0 select-none" aria-hidden="true">{block.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{block.label}</p>
          {block.note && (
            <p className="text-xs text-muted-foreground mt-0.5">{block.note}</p>
          )}
        </div>
        {mine && (
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/weather:opacity-100 transition-opacity">
            {onEdit && (
              <WeatherDialog
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
                description="Le bloc météo sera supprimé définitivement."
                onConfirm={onDelete}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
