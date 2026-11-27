"use client";

import { useTranslations } from "next-intl";
import type { DiceBlock } from "@/lib/chat-blocks";
import { diceRollOutcome, rollFormula, type DiceRoll } from "@/lib/worldDice";
import { cn } from "@/lib/utils";

/**
 * Le résultat d'un lancer. Il se lit dans la ligne `dice_rolls` tirée par la
 * base (`roll`, migration 270) ; un ancien lancer, sans ligne, se lit dans le
 * texte du message, comme avant.
 */
export function DiceBlockView({ block, roll }: { block: DiceBlock; roll?: DiceRoll | null }) {
  const t = useTranslations("chatrooms");

  const formula = roll ? rollFormula(roll) : block.formula;
  const results = roll ? roll.results : block.results;
  const modifier = roll ? roll.modifier : block.modifier;
  const total = roll ? roll.total : block.total;
  const outcome = roll
    ? diceRollOutcome(roll)
    : diceRollOutcome({
        min_value: 1,
        max_value: parseInt(block.formula.split(/[dD]/)[1], 10),
        count: block.results.length,
        results: block.results,
      });
  const isCrit = outcome === "critical";
  const isFumble = outcome === "fumble";

  const detail = results.length > 1
    ? ` (${results.join(" + ")}${modifier !== 0 ? ` ${modifier > 0 ? "+" : ""}${modifier}` : ""})`
    : "";

  return (
    <span className="text-sm text-muted-foreground">
      {t("diceRolled")}{" "}
      <span className="font-mono text-muted-foreground">{formula}</span>
      {" "}{t("diceGot")}{" "}
      <span className={cn(
        "font-semibold text-foreground",
        isCrit && "text-success",
        isFumble && "text-destructive",
      )}>
        {total}
      </span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      {isCrit && <span className="text-success"> — {t("diceCritical")}</span>}
      {isFumble && <span className="text-destructive"> — {t("diceFumble")}</span>}
      {block.label && !isCrit && !isFumble && (
        <span> : {block.label}</span>
      )}
      {block.label && (isCrit || isFumble) && (
        <span className="text-muted-foreground"> · {block.label}</span>
      )}
    </span>
  );
}
