"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { DiceBlock } from "@/lib/chat-blocks";
import { diceRollOutcome, faceOf, rollFormula, rollHidesNumbers, type DiceRoll } from "@/lib/worldDice";
import { cn } from "@/lib/utils";
import { useChatroomDiceRules } from "./chatroomDiceRules";

/**
 * Un lancer, en ligne d'action : la description en titre (« Attaque »), qui a
 * lancé et le dé en dessous, les dés à droite — en image ou en nombre —, puis
 * le total, comme un score. Sans description, le titre est le dé lancé.
 *
 * Le résultat se lit dans la ligne `dice_rolls` tirée par la base (`roll`,
 * migration 270) ; un ancien lancer, sans ligne, se lit dans le texte du
 * message. Le total ne s'écrit que s'il apprend quelque chose (plusieurs dés,
 * ou un modificateur). Une face en image (migration 272) se montre seule, sans
 * son nombre : le lancer n'a alors ni total ni modificateur. Critique et échec
 * critique suivent les options du monde (migration 273).
 */
export function DiceBlockView({
  block,
  roll,
  author,
  children,
}: {
  block: DiceBlock;
  roll?: DiceRoll | null;
  /** Le nom de qui a lancé, en tête de la ligne du dessous. */
  author?: ReactNode;
  /** Ce qui suit cette ligne : marque « Non vérifié », saisie de la description. */
  children?: ReactNode;
}) {
  const t = useTranslations("chatrooms");
  const { critical, fumble } = useChatroomDiceRules();

  const formula = roll ? rollFormula(roll) : block.formula;
  const results = roll ? roll.results : block.results;
  const modifier = roll ? roll.modifier : block.modifier;
  const total = roll ? roll.total : block.total;
  const outcome = roll
    ? diceRollOutcome(roll, { critical, fumble })
    : diceRollOutcome(
        {
          min_value: 1,
          max_value: parseInt(block.formula.split(/[dD]/)[1], 10),
          count: block.results.length,
          results: block.results,
        },
        { critical, fumble },
      );
  const faces = roll?.faces?.length ? roll.faces : null;
  const hideNumbers = roll ? rollHidesNumbers(roll) : false;
  const showTotal = !hideNumbers && (results.length > 1 || modifier !== 0);
  const outcomeTone = outcome === "critical" ? "text-success" : outcome === "fumble" ? "text-destructive" : "text-foreground";
  const label = block.label?.trim();

  return (
    <div
      data-testid="dice-roll"
      className="flex w-full max-w-xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <p data-testid="dice-roll-title" className="truncate text-sm font-semibold text-foreground">
          {label || formula}
        </p>
        <p data-testid="dice-roll-meta" className="text-xs text-muted-foreground">
          {author}
          {label && (
            <>
              <span aria-hidden> · </span>
              <span>{formula}</span>
            </>
          )}
          {children}
        </p>
      </div>

      <div data-testid="dice-roll-result" className="ml-auto flex shrink-0 items-center gap-2">
        {results.map((value, i) => {
          const face = faceOf(faces, value);
          if (face) {
            return (
              // eslint-disable-next-line @next/next/no-img-element -- image de face, déjà réduite au téléversement
              <img
                key={i}
                src={face.image}
                alt={t("diceFace", { value })}
                className="size-9 rounded-md object-contain"
                loading="lazy"
                decoding="async"
              />
            );
          }
          return (
            <span
              key={i}
              className={cn(
                "grid h-9 min-w-9 place-items-center rounded-md border bg-muted/40 px-1.5 text-base font-semibold tabular-nums",
                outcome === "critical" ? "border-success/60" : outcome === "fumble" ? "border-destructive/60" : "border-border",
                outcomeTone,
              )}
            >
              {value}
            </span>
          );
        })}
        {modifier !== 0 && !hideNumbers && (
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {modifier > 0 ? `+${modifier}` : `−${Math.abs(modifier)}`}
          </span>
        )}
        {showTotal && (
          <>
            <span aria-hidden className="mx-1 w-px self-stretch bg-border" />
            <span className={cn("min-w-8 text-center text-2xl font-semibold tabular-nums", outcomeTone)}>{total}</span>
          </>
        )}
        {outcome === "critical" && <Badge tone="success">{t("diceCritical")}</Badge>}
        {outcome === "fumble" && <Badge tone="danger">{t("diceFumble")}</Badge>}
      </div>
    </div>
  );
}
