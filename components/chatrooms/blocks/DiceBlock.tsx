"use client";

import { useTranslations } from "next-intl";
import type { DiceBlock } from "@/lib/chat-blocks";
import { cn } from "@/lib/utils";

export function DiceBlockView({ block, mine: _mine }: { block: DiceBlock; mine: boolean }) {
  const t = useTranslations("chatrooms");
  const isCrit = block.results.length === 1 && block.results[0] === parseInt(block.formula.split(/[dD]/)[1], 10);
  const isFumble = block.results.length === 1 && block.results[0] === 1;

  const detail = block.results.length > 1
    ? ` (${block.results.join(" + ")}${block.modifier !== 0 ? ` ${block.modifier > 0 ? "+" : ""}${block.modifier}` : ""})`
    : "";

  return (
    <span className="text-sm text-muted-foreground">
      {t("diceRolled")}{" "}
      <span className="font-mono text-foreground/70">{block.formula}</span>
      {" "}{t("diceGot")}{" "}
      <span className={cn(
        "font-semibold text-foreground",
        isCrit && "text-green-500",
        isFumble && "text-red-500",
      )}>
        {block.total}
      </span>
      {detail && <span className="text-xs text-muted-foreground/60">{detail}</span>}
      {isCrit && <span className="text-green-500"> — {t("diceCritical")}</span>}
      {isFumble && <span className="text-red-500"> — {t("diceFumble")}</span>}
      {block.label && !isCrit && !isFumble && (
        <span> : {block.label}</span>
      )}
      {block.label && (isCrit || isFumble) && (
        <span className="text-muted-foreground/60"> · {block.label}</span>
      )}
    </span>
  );
}
