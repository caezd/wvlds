"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Vote, Plus, X, Check } from "lucide-react";
import type { ChoiceBlock, ChoiceOption } from "@/lib/chat-blocks";
import type { ChoiceVoteSummary } from "@/types/db";
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

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 9;

function newOption(): ChoiceOption {
  return { id: crypto.randomUUID(), label: "" };
}

export function ChoiceDialog({
  onSend,
  initialBlock,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  onSend: (content: string) => void;
  initialBlock?: ChoiceBlock;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const t = useTranslations("chatrooms");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [question, setQuestion] = useState(initialBlock?.question ?? "");
  const [options, setOptions] = useState<ChoiceOption[]>(
    initialBlock?.options ?? [newOption(), newOption()],
  );

  function handleOpen(v: boolean) {
    if (v) {
      setQuestion(initialBlock?.question ?? "");
      setOptions(initialBlock?.options ?? [newOption(), newOption()]);
    }
    setOpen(v);
  }

  function addOption() {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, newOption()]));
  }
  function updateOption(i: number, label: string) {
    setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, label } : o)));
  }
  function removeOption(i: number) {
    setOptions((prev) => (prev.length <= MIN_OPTIONS ? prev : prev.filter((_, j) => j !== i)));
  }

  const trimmedOptions = options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label);
  const canSend = trimmedOptions.length >= MIN_OPTIONS;

  function handleSend() {
    if (!canSend) return;
    const block: ChoiceBlock = {
      _type: "choice",
      ...(question.trim() ? { question: question.trim() } : {}),
      options: trimmedOptions,
    };
    onSend(JSON.stringify(block));
    setOpen(false);
    if (!initialBlock) { setQuestion(""); setOptions([newOption(), newOption()]); }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {!onOpenChange && trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Vote className="h-4 w-4" />
            {t("choiceDialogTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Configurer un choix à insérer dans le message
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("choiceQuestionLabel")}</Label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t("choiceQuestionPlaceholder")}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">{t("choiceOptionsLabel")}</Label>
              {options.length < MAX_OPTIONS && (
                <button
                  type="button"
                  onClick={addOption}
                  className="flex items-center gap-0.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  {t("choiceAddOption")}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {options.map((option, i) => (
                <div key={option.id} className="flex items-center gap-2">
                  <Input
                    value={option.label}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={t("choiceOptionPlaceholder", { n: i + 1 })}
                    className="h-8 text-sm flex-1 min-w-0"
                    onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    disabled={options.length <= MIN_OPTIONS}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("callout.cancel")}</Button>
          <Button onClick={handleSend} disabled={!canSend}>
            {initialBlock ? t("callout.save") : t("callout.insert")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChoiceBlockView({
  block,
  mine,
  votes,
  onVote,
  onEdit,
  onDelete,
}: {
  block: ChoiceBlock;
  /** L'auteur du message : ne peut pas voter sur son propre choix. */
  mine: boolean;
  votes: ChoiceVoteSummary[];
  onVote?: (optionId: string) => void;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("chatrooms");
  const [pending, setPending] = useState(false);

  const total = votes.reduce((sum, v) => sum + v.count, 0);
  const votesByOption = new Map(votes.map((v) => [v.option_id, v]));
  const myOptionId = votes.find((v) => v.mine)?.option_id ?? null;

  async function handleVote(optionId: string) {
    if (mine || !onVote || pending || optionId === myOptionId) return;
    setPending(true);
    try {
      await onVote(optionId);
    } finally {
      setPending(false);
    }
  }

  return (
    <GameBlockSurface className="border">
      <div className="flex items-start gap-3 px-2">
        <div className="min-w-0 flex-1">
          {block.question && (
            <p className="px-1 text-sm font-semibold leading-tight mb-2">{block.question}</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {block.options.map((option) => {
              const summary = votesByOption.get(option.id);
              const count = summary?.count ?? 0;
              const isMine = summary?.mine ?? false;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const clickable = !mine && !!onVote;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={!clickable || pending}
                  onClick={() => handleVote(option.id)}
                  className={cn(
                    "relative flex flex-col items-start gap-1 overflow-hidden rounded-lg border p-2.5 text-left transition-colors",
                    isMine
                      ? "border-accent/50 bg-accent/10"
                      : "border-none bg-card",
                    clickable && !isMine && "hover:border-accent/40 hover:bg-accent/5 cursor-pointer",
                    !clickable && "cursor-default",
                  )}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-accent/10"
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                  <span className="relative flex w-full items-center gap-1 text-xs font-medium">
                    {isMine && <Check className="h-3 w-3 shrink-0 text-accent dark:text-accent" />}
                    <span className="truncate">{option.label}</span>
                  </span>
                  <span className="relative text-[10px] text-muted-foreground">
                    {t("choiceVoteCount", { count })}
                  </span>
                </button>
              );
            })}
          </div>
          {mine && (
            <p className="mt-2 text-[11px] italic text-muted-foreground">{t("choiceOwnHint")}</p>
          )}
        </div>
        <GameBlockToolbar
          mine={mine}
          className="shrink-0"
          editDialog={
            onEdit && (
              <ChoiceDialog initialBlock={block} onSend={onEdit} trigger={<GameBlockEditButton />} />
            )
          }
          onDelete={onDelete}
          deleteDescription={t("choiceDeleteDescription")}
        />
      </div>
    </GameBlockSurface>
  );
}
