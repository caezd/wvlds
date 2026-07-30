"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import type { HpBlock } from "@/lib/chat-blocks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { GameBlockSurface, GameBlockToolbar, GameBlockEditButton } from "./GameBlockShell";

export function HpDialog({
  onSend,
  initialBlock,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  onSend: (content: string) => void;
  initialBlock?: HpBlock;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [name, setName] = useState(initialBlock?.name ?? "");
  const [current, setCurrent] = useState(String(initialBlock?.current ?? ""));
  const [max, setMax] = useState(String(initialBlock?.max ?? ""));

  function handleOpen(v: boolean) {
    if (v) {
      setName(initialBlock?.name ?? "");
      setCurrent(String(initialBlock?.current ?? ""));
      setMax(String(initialBlock?.max ?? ""));
    }
    setOpen(v);
  }

  function handleSend() {
    const trimmedName = name.trim();
    const cur = parseInt(current, 10);
    const mx = parseInt(max, 10);
    if (!trimmedName || isNaN(cur) || isNaN(mx) || mx <= 0) return;
    const block = { _type: "hp", name: trimmedName, current: Math.max(0, cur), max: mx };
    onSend(JSON.stringify(block));
    setOpen(false);
    if (!initialBlock) { setName(""); setCurrent(""); setMax(""); }
  }

  const isValid =
    name.trim().length > 0 &&
    !isNaN(parseInt(current, 10)) &&
    !isNaN(parseInt(max, 10)) &&
    parseInt(max, 10) > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {!onOpenChange && trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Jauge de vie
          </DialogTitle>
          <DialogDescription className="sr-only">
            Configurer une jauge de vie à insérer dans le message
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Nom <span className="text-destructive">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. Gornak le Berserker"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">
                PV actuels <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                min={0}
                placeholder="62"
                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">
                PV max <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                value={max}
                onChange={(e) => setMax(e.target.value)}
                min={1}
                placeholder="100"
                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={handleSend} disabled={!isValid}>
            {initialBlock ? "Enregistrer" : "Insérer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HpBlockView({
  block,
  mine,
  onEdit,
  onDelete,
}: {
  block: HpBlock;
  mine: boolean;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
}) {
  const pct = block.max > 0 ? Math.max(0, Math.min(100, (block.current / block.max) * 100)) : 0;
  const barColor = pct > 60 ? "bg-emerald-500" : pct > 30 ? "bg-amber-500" : "bg-red-500";
  const valueColor = pct <= 30 ? "text-red-500" : "text-foreground";

  return (
    <GameBlockSurface>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Heart className="h-3.5 w-3.5 text-red-500/70 shrink-0" />
          <span className="text-sm font-medium truncate">{block.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-muted-foreground">
            <span className={cn("font-semibold", valueColor)}>{block.current}</span>
            {" / "}{block.max} PV
          </span>
          <GameBlockToolbar
            mine={mine}
            editDialog={
              onEdit && (
                <HpDialog initialBlock={block} onSend={onEdit} trigger={<GameBlockEditButton />} />
              )
            }
            onDelete={onDelete}
            deleteDescription="La jauge de vie sera supprimée définitivement."
          />
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </GameBlockSurface>
  );
}
