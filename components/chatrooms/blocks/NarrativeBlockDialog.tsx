"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type NarrativeBlockType = "reveal";

type Config = {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  textLabel: string;
  textPlaceholder: string;
  extraLabel?: string;
  extraKey?: string;
  extraPlaceholder?: string;
};

const CONFIG: Record<NarrativeBlockType, Config> = {
  reveal: {
    title: "Révélation",
    Icon: Eye,
    textLabel: "Contenu à révéler",
    textPlaceholder: "Ce qui est caché jusqu'au clic…",
    extraLabel: "Indice (optionnel)",
    extraKey: "hint",
    extraPlaceholder: "ex. Un secret s'apprête à être révélé…",
  },
};

export function NarrativeBlockDialog({
  blockType,
  onSend,
  initialText,
  initialExtra,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  blockType: NarrativeBlockType;
  onSend: (content: string) => void;
  initialText?: string;
  initialExtra?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const cfg = CONFIG[blockType];
  const [text, setText] = useState(initialText ?? "");
  const [extra, setExtra] = useState(initialExtra ?? "");

  function handleOpen(v: boolean) {
    if (v) {
      setText(initialText ?? "");
      setExtra(initialExtra ?? "");
    }
    setOpen(v);
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const block: Record<string, string> = { _type: blockType, text: trimmed };
    if (extra.trim() && cfg.extraKey) block[cfg.extraKey] = extra.trim();
    onSend(JSON.stringify(block));
    setOpen(false);
    if (!initialText) {
      setText("");
      setExtra("");
    }
  }

  const { Icon } = cfg;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {!onOpenChange && trigger && (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {cfg.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {cfg.extraLabel && cfg.extraKey && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{cfg.extraLabel}</Label>
              <Input
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder={cfg.extraPlaceholder}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{cfg.textLabel}</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={cfg.textPlaceholder}
              rows={4}
              autoFocus
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend();
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={handleSend} disabled={!text.trim()}>
            {initialText ? "Enregistrer" : "Insérer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
