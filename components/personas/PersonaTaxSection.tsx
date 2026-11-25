"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Landmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { usePersonaTax, type TaxPayResult } from "@/hooks/usePersonaTax";
import { formatAmount, type CurrencyUnit } from "@/lib/worldCurrency";
import { taxStatusOf, type TaxDue, type TaxSettings } from "@/lib/worldTax";
import { cn } from "@/lib/utils";

export type PersonaTax = {
  status: "loading" | "off" | "on";
  settings: TaxSettings | null;
  dues: TaxDue[];
  pay: () => Promise<TaxPayResult>;
  waive: () => Promise<boolean>;
};

/**
 * La taxe d'un persona, dans l'onglet Inventaire (migration 255) : ce que
 * le monde prélève et à quel rythme, ce qui reste dû ou en retard ; le
 * joueur paie (mode manuel), qui gère l'économie annule une dette échue.
 */
export function PersonaTaxSection({
  tax,
  units,
  canPay,
  canManage,
  onPaid,
}: {
  tax: PersonaTax;
  units: CurrencyUnit[];
  canPay: boolean;
  canManage: boolean;
  /** La bourse a bougé. */
  onPaid?: () => void;
}) {
  const t = useTranslations("personas.tax");
  const [busy, setBusy] = useState(false);
  if (tax.status !== "on" || !tax.settings) return null;
  const { settings } = tax;
  const state = taxStatusOf(tax.dues);
  const money = (v: number) => formatAmount(v, units);

  async function pay() {
    setBusy(true);
    const res = await tax.pay();
    setBusy(false);
    if (!res.ok) {
      toast.error(t(res.error === "insufficient" ? "insufficient" : "failed"));
      return;
    }
    toast.success(t("paid"));
    onPaid?.();
  }

  async function waive() {
    setBusy(true);
    const ok = await tax.waive();
    setBusy(false);
    if (!ok) {
      toast.error(t("failed"));
      return;
    }
    toast.success(t("waived"));
  }

  const showPay = canPay && settings.tax_mode === "manual" && state.unpaidCount > 0;
  const showWaive = canManage && state.overdueCount > 0;

  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Landmark className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <SectionLabel>{t("title")}</SectionLabel>
        <p className="text-sm tabular-nums">
          {t(`rate.${settings.tax_unit}`, { amount: money(settings.tax_amount), count: settings.tax_every })}
        </p>
        <p className={cn("text-sm", state.overdueCount > 0 ? "text-destructive" : "text-muted-foreground")}>
          {state.overdueCount > 0
            ? t("overdue", { periods: state.overdueCount, amount: money(state.overdueTotal) })
            : state.unpaidCount > 0
              ? t("due", { amount: money(state.unpaidTotal) })
              : t("upToDate")}
        </p>
        {settings.tax_mode === "auto" && <p className="text-xs text-muted-foreground">{t("auto")}</p>}
      </div>
      {(showPay || showWaive) && (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {showPay && (
            <Button size="sm" disabled={busy} onClick={() => void pay()}>
              {t("pay")}
            </Button>
          )}
          {showWaive && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void waive()}>
              {t("waive")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** La section branchée sur la base, pour l'onglet Inventaire. */
export function PersonaTaxBlock({
  personaId,
  units,
  canPay,
  canManage,
  onPaid,
}: {
  personaId: string;
  units: CurrencyUnit[];
  canPay: boolean;
  canManage: boolean;
  onPaid?: () => void;
}) {
  const tax = usePersonaTax(personaId);
  return <PersonaTaxSection tax={tax} units={units} canPay={canPay} canManage={canManage} onPaid={onPaid} />;
}
