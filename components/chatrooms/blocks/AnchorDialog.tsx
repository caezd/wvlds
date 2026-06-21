"use client";

import { useState } from "react";
import { Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AnchorDialog({
  open,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSend: (content: string) => void;
}) {
  const [label, setLabel] = useState("");

  function handleSend() {
    const trimmed = label.trim();
    if (!trimmed) return;
    onSend(JSON.stringify({ _type: "anchor", label: trimmed }));
    setLabel("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setLabel(""); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Anchor className="h-4 w-4" />
            Ancre de navigation
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <Label htmlFor="anchor-label">Texte de l'ancre</Label>
          <Input
            id="anchor-label"
            placeholder="ex. Prologue, Acte II, Flashback…"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setLabel(""); onOpenChange(false); }}>
            Annuler
          </Button>
          <Button onClick={handleSend} disabled={!label.trim()}>
            Insérer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
