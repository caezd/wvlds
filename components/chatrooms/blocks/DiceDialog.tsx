"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Dices, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DieGlyph } from "@/components/worlds/dice/DieGlyph";
import { listWorldDice } from "@/app/actions/worldDice";
import { cn } from "@/lib/utils";
import {
  DIE_VALUE_LIMIT,
  MAX_ROLL_COUNT,
  parseFreeFormula,
  standardFacesOf,
  type DiceRollRequest,
  type WorldDie,
} from "@/lib/worldDice";
import { useChatroomDiceRules } from "./chatroomDiceRules";

/** Les raccourcis d'un monde sans dés à lui. */
const PRESETS = ["1d4", "1d6", "1d8", "1d10", "1d12", "1d20", "1d100", "2d6"];
/** La source « formule libre », à côté des dés du monde. */
const FREE = "free";

/**
 * La fenêtre « Lancer un dé ». Elle ne tire rien : elle dit à la base quoi
 * tirer (`onRoll`), et le composeur publie le lancer (migration 270).
 *
 * Les dés du monde se choisissent en tête, à la place des raccourcis ; une
 * formule libre n'est proposée que si le monde la permet.
 */
export function DiceDialog({ onRoll, open, onOpenChange }: {
  onRoll: (request: DiceRollRequest) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("chatrooms");
  const { worldId, mode } = useChatroomDiceRules();
  const freeAllowed = mode === "free";
  const ids = useId();

  const [dice, setDice] = useState<WorldDie[] | null>(worldId ? null : []);
  const [source, setSource] = useState<string>(FREE);
  const [formula, setFormula] = useState("1d20");
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Les dés du monde, relus à chaque ouverture : l'équipe a pu en ajouter.
  useEffect(() => {
    if (!open || !worldId) return;
    let cancelled = false;
    void listWorldDice(worldId).then((res) => {
      if (cancelled) return;
      const list = res.ok ? res.dice : [];
      setDice(list);
      setSource((current) => {
        if (current !== FREE && list.some((d) => d.id === current)) return current;
        return freeAllowed || list.length === 0 ? FREE : list[0].id;
      });
    });
    return () => { cancelled = true; };
  }, [open, worldId, freeAllowed]);

  const worldDice = dice ?? [];
  const selectedDie = worldDice.find((d) => d.id === source) ?? null;
  const showFormula = freeAllowed && !selectedDie;
  const nothingToRoll = !freeAllowed && dice !== null && worldDice.length === 0;

  function reset() {
    setLabel("");
    setFormula("1d20");
    setCount(1);
    setModifier(0);
    setError(null);
  }

  function handleRoll() {
    setError(null);
    const trimmed = label.trim() || undefined;
    if (selectedDie) {
      if (!Number.isInteger(count) || count < 1 || count > MAX_ROLL_COUNT) {
        setError(t("diceCountRange", { max: MAX_ROLL_COUNT }));
        return;
      }
      if (!Number.isInteger(modifier) || Math.abs(modifier) > DIE_VALUE_LIMIT) {
        setError(t("diceModifierRange"));
        return;
      }
      onRoll({ dieId: selectedDie.id, count, modifier, label: trimmed });
    } else {
      if (!freeAllowed) return;
      const parsed = parseFreeFormula(formula);
      if (!parsed) {
        setError(t("diceError"));
        return;
      }
      onRoll({ ...parsed, label: trimmed });
    }
    onOpenChange(false);
    reset();
  }

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRoll();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("diceTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {worldDice.length > 0 && (
            <div className="space-y-1.5">
              <Label id={`${ids}-die`}>{t("diceDie")}</Label>
              <div role="radiogroup" aria-labelledby={`${ids}-die`} className="flex flex-wrap gap-1.5">
                {freeAllowed && (
                  <DieChip checked={source === FREE} onSelect={() => { setSource(FREE); setError(null); }}>
                    {t("diceFreeFormula")}
                  </DieChip>
                )}
                {worldDice.map((die) => (
                  <DieChip
                    key={die.id}
                    checked={source === die.id}
                    ariaLabel={die.hidden ? t("diceHiddenName", { name: die.name }) : die.name}
                    onSelect={() => { setSource(die.id); setError(null); }}
                  >
                    <DieGlyph faces={standardFacesOf(die)} className="size-4" />
                    <span className="truncate">{die.name}</span>
                    {die.hidden && <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
                  </DieChip>
                ))}
              </div>
            </div>
          )}

          {nothingToRoll && <p className="text-sm text-muted-foreground">{t("diceNoWorldDice")}</p>}

          {showFormula && (
            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-formula`}>{t("formula")}</Label>
              <Input
                id={`${ids}-formula`}
                value={formula}
                onChange={(e) => { setFormula(e.target.value); setError(null); }}
                placeholder={t("formulaPlaceholder")}
                onKeyDown={submitOnEnter}
              />
              {worldDice.length === 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {PRESETS.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => { setFormula(p); setError(null); }}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedDie && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${ids}-count`}>{t("diceCount")}</Label>
                <Input
                  id={`${ids}-count`}
                  type="number"
                  min={1}
                  max={MAX_ROLL_COUNT}
                  step={1}
                  value={Number.isFinite(count) ? count : ""}
                  onChange={(e) => { setCount(e.target.valueAsNumber); setError(null); }}
                  onKeyDown={submitOnEnter}
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${ids}-modifier`}>{t("diceModifier")}</Label>
                <Input
                  id={`${ids}-modifier`}
                  type="number"
                  step={1}
                  value={Number.isFinite(modifier) ? modifier : ""}
                  onChange={(e) => { setModifier(e.target.valueAsNumber); setError(null); }}
                  onKeyDown={submitOnEnter}
                  className="tabular-nums"
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-label`}>{t("diceLabel")}</Label>
            <Input
              id={`${ids}-label`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("diceLabelPlaceholder")}
              onKeyDown={submitOnEnter}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("cancelEdit")}</Button>
          <Button onClick={handleRoll} disabled={nothingToRoll || dice === null}>
            <Dices className="h-4 w-4 mr-1.5" />
            {t("diceRoll")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Un dé à choisir, en pastille comme les anciens raccourcis. */
function DieChip({
  checked,
  onSelect,
  ariaLabel,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onSelect}
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked
          ? "border-foreground bg-muted text-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
