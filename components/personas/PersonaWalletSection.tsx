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
import { AmountInput } from "@/components/economy/AmountInput";
import { Money } from "@/components/economy/Money";
import { cn } from "@/lib/utils";
import type { CurrencyUnit } from "@/lib/worldCurrency";
import type { AdjustResult, WalletMovement } from "@/hooks/usePersonaWallet";

const MAX_NOTE_LENGTH = 200;

/** La date d'un mouvement, courte : « 4 mars, 10:00 », l'année seulement si ce n'est pas l'année en cours. */
export function formatMovementDate(iso: string, locale: string, now: Date = new Date()): string {
  const date = new Date(iso);
  return date.toLocaleString(locale, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type PersonaWallet = {
  status: "loading" | "off" | "on";
  units: CurrencyUnit[];
  balance: number;
  ledger: WalletMovement[];
  /** Il reste des mouvements plus anciens ; `loadMore` les ajoute à la suite. */
  hasMore?: boolean;
  loadMore?: () => Promise<void>;
  adjust: (delta: number, note: string) => Promise<AdjustResult>;
  /** Relit la bourse quand elle a bougé ailleurs. */
  refresh?: () => Promise<void>;
};

/**
 * La bourse d'un persona, onglet de sa fiche (migration 246) : le solde
 * décomposé en paliers, les derniers mouvements (rendus par la base au seul
 * joueur et à qui gère l'économie) avec « Voir plus », et l'ajustement pour
 * ces derniers. Un mouvement dit sa nature, puis son motif en détail : la
 * base écrit le motif des achats (« Épée ×2 · Comptoir ») et des transferts.
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
  const [loadingMore, setLoadingMore] = useState(false);

  async function more() {
    if (!wallet.loadMore) return;
    setLoadingMore(true);
    try {
      await wallet.loadMore();
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Coins className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <SectionLabel>{t("balance")}</SectionLabel>
          <Money
            data-testid="persona-wallet-balance"
            amount={wallet.balance}
            units={wallet.units}
            className="block text-lg font-semibold"
          />
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
              // Deux lignes, comme un relevé : la nature et le montant, puis
              // la date et le motif. Rien ne se dispute la largeur d'un téléphone.
              <li key={m.id} className="space-y-0.5 px-3 py-2 text-sm">
                <div className="flex items-baseline gap-3">
                  <p className="min-w-0 flex-1 truncate">{t(`kinds.${m.kind}`)}</p>
                  <Money
                    amount={m.delta}
                    units={wallet.units}
                    signed
                    className={cn("shrink-0 font-medium", m.delta > 0 ? "text-success" : "text-destructive")}
                  />
                </div>
                <p className="flex min-w-0 gap-1.5 text-xs text-muted-foreground">
                  <time
                    dateTime={m.created_at}
                    title={new Date(m.created_at).toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })}
                    className="shrink-0 tabular-nums"
                  >
                    {formatMovementDate(m.created_at, locale)}
                  </time>
                  {m.note && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="min-w-0 truncate" title={m.note}>
                        {m.note}
                      </span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
        {wallet.hasMore && wallet.loadMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            disabled={loadingMore}
            onClick={() => void more()}
          >
            {t("more")}
          </Button>
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
  const tEconomy = useTranslations("economy");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  // Le champ de montant garde sa saisie : on le remonte à chaque remise à zéro.
  const [round, setRound] = useState(0);

  function reset() {
    setDirection(1);
    setAmount(0);
    setNote("");
    setRound((r) => r + 1);
  }

  async function submit() {
    setSaving(true);
    const res = await adjust(direction * amount, note.trim());
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error === "insufficient" ? tEconomy("insufficientFunds") : t("failed"));
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
          <AmountInput
            key={round}
            units={units}
            value={null}
            onChange={(v) => setAmount(v ?? 0)}
            idPrefix="wallet-unit"
            labelOf={(unit) => t("amountIn", { unit: unit.name })}
          />
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
