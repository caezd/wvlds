"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("chatrooms");
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
      setError(t("diceError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!onOpenChange && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" title={t("diceTitle")}>
            <Dices className="h-4 w-4" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("diceTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("formula")}</Label>
            <Input
              value={formula}
              onChange={(e) => { setFormula(e.target.value); setError(null); }}
              placeholder={t("formulaPlaceholder")}
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
            <Label>{t("diceLabel")}</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("diceLabelPlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("cancelEdit")}</Button>
          <Button onClick={handleSend}>
            <Dices className="h-4 w-4 mr-1.5" />
            {t("diceRoll")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
