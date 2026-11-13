"use client";

import { useState } from "react";
import { Sword } from "lucide-react";
import type { NpcBlock } from "@/lib/chat-blocks";
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
import { Badge } from "@/components/ui/badge";
import { EmojiPickerButton } from "@/components/chatrooms/reactions/EmojiPickerButton";
import { GameBlockSurface, GameBlockToolbar, GameBlockEditButton } from "./GameBlockShell";
import { useTranslations } from "next-intl";

export function NpcDialog({
  onSend,
  initialBlock,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  onSend: (content: string) => void;
  initialBlock?: NpcBlock;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const tCommon = useTranslations("common");
  const t = useTranslations("chatrooms");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [name, setName] = useState(initialBlock?.name ?? "");
  const [role, setRole] = useState(initialBlock?.role ?? "");
  const [emoji, setEmoji] = useState(initialBlock?.emoji ?? "");
  const [stats, setStats] = useState(initialBlock?.stats ?? "");

  function handleOpen(v: boolean) {
    if (v) {
      setName(initialBlock?.name ?? "");
      setRole(initialBlock?.role ?? "");
      setEmoji(initialBlock?.emoji ?? "");
      setStats(initialBlock?.stats ?? "");
    }
    setOpen(v);
  }

  function handleSend() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const block: Record<string, string> = { _type: "npc", name: trimmedName };
    if (role.trim()) block.role = role.trim();
    if (emoji.trim()) block.emoji = emoji.trim();
    if (stats.trim()) block.stats = stats.trim();
    onSend(JSON.stringify(block));
    setOpen(false);
    if (!initialBlock) { setName(""); setRole(""); setEmoji(""); setStats(""); }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {!onOpenChange && trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sword className="h-4 w-4" />
            Mini-fiche PNJ
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="space-y-1.5 w-16">
              <Label className="text-xs text-muted-foreground">{tCommon("icon")}</Label>
              <EmojiPickerButton value={emoji} onChange={setEmoji} />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">
                Nom <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("npcExampleTitle")}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("npcRoleOptional")}</Label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={t("npcRolePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Stats (optionnel)</Label>
            <Input
              value={stats}
              onChange={(e) => setStats(e.target.value)}
              placeholder="ex. PV 40 · ATQ 12 · DEF 8"
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={handleSend} disabled={!name.trim()}>
            {initialBlock ? "Enregistrer" : "Insérer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NpcBlockView({
  block,
  mine,
  onEdit,
  onDelete,
}: {
  block: NpcBlock;
  mine: boolean;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
}) {
  const initials = block.name.slice(0, 2).toUpperCase();
  const statChips = block.stats
    ? block.stats.split(/[·,|]/).map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <GameBlockSurface className="border-npc/20 bg-npc/5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-npc-soft text-base select-none">
          {block.emoji || initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{block.name}</p>
          {block.role && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{block.role}</p>
          )}
        </div>
        <GameBlockToolbar
          mine={mine}
          className="shrink-0"
          editDialog={
            onEdit && (
              <NpcDialog initialBlock={block} onSend={onEdit} trigger={<GameBlockEditButton />} />
            )
          }
          onDelete={onDelete}
          deleteDescription="La fiche PNJ sera supprimée définitivement."
        />
      </div>
      {statChips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-12">
          {statChips.map((stat, i) => (
            <Badge key={i} tone="npc">
              {stat}
            </Badge>
          ))}
        </div>
      )}
    </GameBlockSurface>
  );
}
