"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Coins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { amountFromCounts, formatAmount, type CurrencyUnit } from "@/lib/worldCurrency";
import type { AdjustResult, WalletMovement } from "@/hooks/usePersonaWallet";

const MAX_NOTE_LENGTH = 200;

export type PersonaWallet = {
  status: "loading" | "off" | "on";
  units: CurrencyUnit[];
  balance: number;
  ledger: WalletMovement[];
  adjust: (delta: number, note: string) => Promise<AdjustResult>;
  /** Relit la bourse quand elle a bougé ailleurs. */
  refresh?: () => Promise<void>;
};

/**
 * La bourse d'un persona, onglet de sa fiche (migration 246) : le solde
 * décomposé en paliers, les derniers mouvements (rendus par la base au seul
 * joueur et à qui gère l'économie), et l'ajustement pour ces derniers.
 */
export function PersonaWalletSection({
  personaName,
  wallet,
  canManage,
}: {
  personaName: string;
  wallet: PersonaWallet;
  canManage: boolean;
}) {
  const t = useTranslations("personas.wallet");
  const locale = useLocale();
  const [adjusting, setAdjusting] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Coins className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <SectionLabel>{t("balance")}</SectionLabel>
          <div data-testid="persona-wallet-balance" className="text-lg font-semibold tabular-nums">
            {formatAmount(wallet.balance, wallet.units)}
          </div>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setAdjusting(true)}>
            {t("adjust")}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <SectionLabel id="persona-wallet-history">{t("history")}</SectionLabel>
        {wallet.ledger.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">{t("noHistory")}</p>
        ) : (
          <ul aria-labelledby="persona-wallet-history" className="divide-y divide-border rounded-md border border-border">
            {wallet.ledger.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span
                  className={cn(
                    "shrink-0 font-medium tabular-nums",
                    m.delta > 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {formatAmount(m.delta, wallet.units, { signed: true })}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {m.note || t(`kinds.${m.kind}`)}
                </span>
                <time dateTime={m.created_at} className="shrink-0 text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleDateString(locale)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && (
        <AdjustDialog
          open={adjusting}
          onOpenChange={setAdjusting}
          personaName={personaName}
          units={wallet.units}
          adjust={wallet.adjust}
        />
      )}
    </div>
  );
}

function AdjustDialog({
  open,
  onOpenChange,
  personaName,
  units,
  adjust,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personaName: string;
  units: CurrencyUnit[];
  adjust: PersonaWallet["adjust"];
}) {
  const t = useTranslations("personas.wallet");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [counts, setCounts] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const amount = amountFromCounts(counts, units);

  function reset() {
    setDirection(1);
    setCounts([]);
    setNote("");
  }

  async function submit() {
    setSaving(true);
    const res = await adjust(direction * amount, note.trim());
    setSaving(false);
    if (!res.ok) {
      toast.error(t(res.error === "insufficient" ? "insufficient" : "failed"));
      return;
    }
    toast.success(t("adjusted"));
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("adjustTitle", { name: personaName })}</DialogTitle>
          <DialogDescription>{t("adjustDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div role="group" aria-label={t("direction")} className="flex gap-2">
            {([1, -1] as const).map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={direction === d ? "default" : "outline"}
                aria-pressed={direction === d}
                onClick={() => setDirection(d)}
              >
                {t(d === 1 ? "credit" : "debit")}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {units.map((unit, i) => (
              <div key={unit.value} className="w-28 space-y-1">
                <Label htmlFor={`wallet-unit-${unit.value}`} className="text-xs text-muted-foreground">
                  {unit.name}
                </Label>
                <Input
                  id={`wallet-unit-${unit.value}`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  aria-label={t("amountIn", { unit: unit.name })}
                  value={Number.isFinite(counts[i]) ? counts[i] : ""}
                  onChange={(e) => {
                    const v = e.target.valueAsNumber;
                    setCounts((current) => {
                      const next = [...current];
                      next[i] = v;
                      return next;
                    });
                  }}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="wallet-note">{t("note")}</Label>
            <Input
              id="wallet-note"
              value={note}
              maxLength={MAX_NOTE_LENGTH}
              placeholder={t("notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={amount === 0 || saving} onClick={() => void submit()}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
