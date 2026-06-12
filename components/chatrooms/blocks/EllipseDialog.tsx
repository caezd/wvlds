"use client";

import { useState } from "react";
import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [
  "Le lendemain matin…",
  "Quelques heures plus tard…",
  "Une semaine plus tard…",
  "Un mois plus tard…",
  "Des années plus tard…",
];

export function EllipseDialog({ onSend, initialLabel, trigger, open: controlledOpen, onOpenChange }: {
  onSend: (content: string) => void;
  initialLabel?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [label, setLabel] = useState(initialLabel ?? "");

  function handleSend() {
    const trimmed = label.trim();
    if (!trimmed) return;
    onSend(JSON.stringify({ _type: "ellipse", label: trimmed }));
    setOpen(false);
    if (!initialLabel) setLabel("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (v && initialLabel) setLabel(initialLabel);
      setOpen(v);
    }}>
      <DialogTrigger asChild>
        {!onOpenChange && (trigger ?? (
        <Button variant="ghost" size="icon-sm" title="Ellipse de temps">
          <Timer className="h-4 w-4" />
        </Button>
      ))}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initialLabel ? "Modifier l'ellipse" : "Ellipse de temps"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Texte</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex. Le lendemain matin…"
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setLabel(p)}
                className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={handleSend} disabled={!label.trim()}>
            {initialLabel ? "Enregistrer" : "Insérer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
