"use client";

import { useState } from "react";
import { Dices } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rollDice } from "@/lib/chat-blocks";

const PRESETS = ["1d4", "1d6", "1d8", "1d10", "1d12", "1d20", "1d100", "2d6"];

export function DiceDialog({ onSend, open: controlledOpen, onOpenChange }: {
  onSend: (content: string) => void;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [formula, setFormula] = useState("1d20");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSend() {
    setError(null);
    try {
      const roll = rollDice(formula);
      const block = JSON.stringify({
        _type: "dice",
        ...roll,
        label: label.trim() || undefined,
      });
      onSend(block);
      setOpen(false);
      setLabel("");
      setFormula("1d20");
    } catch {
      setError("Formule invalide. Exemples : 1d20, 2d6+3, 1d8-1");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!onOpenChange && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" title="Lancer un dé">
            <Dices className="h-4 w-4" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Lancer un dé</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Formule</Label>
            <Input
              value={formula}
              onChange={(e) => { setFormula(e.target.value); setError(null); }}
              placeholder="ex. 2d6+3"
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFormula(p)}
                  className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Étiquette <span className="text-muted-foreground">(optionnel)</span></Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex. Attaque, Sauvegarde…"
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={handleSend}>
            <Dices className="h-4 w-4 mr-1.5" />
            Lancer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
