"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Coins, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpHint } from "@/components/ui/help-hint";
import { setWorldCurrency } from "@/app/actions/worldCatalog";
import { useAutoSave } from "@/hooks/useAutoSave";
import { messageErreurAction } from "@/lib/actionErrors";
import { cn } from "@/lib/utils";
import type { World } from "@/types/worlds";
import {
  MAX_CURRENCY_NAME_LENGTH,
  MAX_CURRENCY_SHORT_LENGTH,
  MAX_CURRENCY_UNITS,
  currencyUnitsOf,
  currencyUnitsSchema,
  formatAmount,
  ratioRowsOf,
  unitsFromRatioRows,
  type CurrencyRatioRow,
  type CurrencyUnit,
} from "@/lib/worldCurrency";
import { AutoSaveIndicator } from "./AutoSaveIndicator";
import { FIELD, SURFACE } from "./FeatureLayout";

/** Le taux proposé pour un palier ajouté au-dessus des autres. */
const NEW_UNIT_RATIO = 10;

/**
 * La monnaie d'un monde (Paramètres › Fonctions › Économie, migration 246) :
 * ses paliers, du plus grand au plus petit, chacun exprimé en nombre du
 * suivant (« 1 Or = 100 Argent »). La base ne garde que les valeurs absolues ;
 * l'éditeur passe par les taux, plus naturels à saisir.
 *
 * Un encadré en tête de la page Devises : l'aperçu (un montant d'exemple et
 * la chaîne de conversion), puis les paliers. Chaque modification valide
 * s'enregistre d'elle-même (useAutoSave).
 */
export function WorldCurrencySettings({
  world,
  onUpdated,
}: {
  world: World;
  onUpdated?: (patch: Partial<World>) => void;
}) {
  const t = useTranslations("worlds.settings.economy.currency");
  const tCommon = useTranslations("common");
  const [initial] = React.useState<CurrencyUnit[]>(() => currencyUnitsOf(world.currency_units));
  const [rows, setRows] = React.useState<CurrencyRatioRow[]>(() => ratioRowsOf(initial));

  const units = React.useMemo(
    () => unitsFromRatioRows(rows.map((r) => ({ ...r, name: r.name.trim(), short: r.short.trim() }))),
    [rows],
  );
  const valid = currencyUnitsSchema.safeParse(units).success;

  const { status, flush } = useAutoSave({
    value: units,
    valid,
    save: async (next) => {
      const res = await setWorldCurrency(world.id, next);
      if (!res.ok) {
        toast.error(messageErreurAction(res.error, tCommon));
        return false;
      }
      onUpdated?.({ currency_units: next });
      return true;
    },
  });

  const patchRow = (i: number, patch: Partial<CurrencyRatioRow>) =>
    setRows((current) => current.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const labelOf = (row: CurrencyRatioRow, i: number) => row.name.trim() || t("fallbackName", { n: i + 1 });

  // L'aperçu reste sur la dernière saisie valide (ajustement pendant le rendu,
  // sans effet) : un taux en cours de frappe ne le fait pas clignoter.
  const [shown, setShown] = React.useState<CurrencyUnit[]>(initial);
  if (valid && JSON.stringify(units) !== JSON.stringify(shown)) setShown(units);

  // L'exemple : cinq fois le deuxième plus petit palier, plus trois unités de base.
  const second = shown[shown.length - 2];
  const example = shown.length > 0 ? formatAmount(second ? 5 * second.value + 3 : 5, shown) : null;
  const chain = shown
    .slice(0, -1)
    .map((unit, i) => t("conversion", { from: unit.name, ratio: unit.value / shown[i + 1].value, to: shown[i + 1].name }))
    .join(" · ");

  return (
    <div role="region" aria-label={t("title")} className={cn("overflow-hidden rounded-md", SURFACE)} onBlur={flush}>
      {/* ── L'aperçu : un montant d'exemple, et la chaîne de conversion ── */}
      <div className="border-b border-border p-5" data-testid="currency-preview">
        <div className="flex items-center gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Coins className="size-3.5 shrink-0" aria-hidden />
            {t("previewLabel")}
            <HelpHint title={t("previewLabel")}>{t("previewHelp")}</HelpHint>
          </p>
          <AutoSaveIndicator status={status} className="ml-auto shrink-0" />
        </div>
        <p
          className="mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums"
          data-testid="currency-preview-amount"
        >
          {example ?? "—"}
        </p>
        {chain && <p className="mt-2 text-xs tabular-nums text-muted-foreground">{chain}</p>}
      </div>

      {/* ── Les paliers, du plus grand au plus petit ── */}
      <section aria-label={t("tiers")} className="space-y-4 p-5">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {t("tiers")}
          <HelpHint title={t("tiers")}>{t("help")}</HelpHint>
        </p>
        <div className="space-y-3 @xl:space-y-2">
          {rows.map((row, i) => {
            const next = rows[i + 1];
            // Étroit : nom, abréviation, corbeille, puis le taux en dessous.
            // Large : tout sur une ligne, la corbeille au bout.
            return (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-x-2 gap-y-1.5 @xl:grid-cols-[minmax(0,1fr)_5rem_minmax(0,16rem)_2.5rem]"
              >
                <Input
                  value={row.name}
                  maxLength={MAX_CURRENCY_NAME_LENGTH}
                  placeholder={t("namePlaceholder")}
                  aria-label={t("unitName", { n: i + 1 })}
                  onChange={(e) => patchRow(i, { name: e.target.value })}
                  className={cn("h-10 min-w-0 rounded-md text-sm", FIELD)}
                />
                <Input
                  value={row.short}
                  maxLength={MAX_CURRENCY_SHORT_LENGTH}
                  placeholder={t("shortPlaceholder")}
                  aria-label={t("unitShort", { n: i + 1 })}
                  onChange={(e) => patchRow(i, { short: e.target.value })}
                  className={cn("h-10 rounded-md text-sm", FIELD)}
                />
                <div className="col-span-3 row-start-2 flex min-w-0 items-center gap-2 text-sm text-muted-foreground @xl:col-span-1 @xl:col-start-3 @xl:row-start-1">
                  {next ? (
                    <>
                      <span aria-hidden>=</span>
                      <Input
                        type="number"
                        min={2}
                        step={1}
                        value={Number.isFinite(row.ratio) ? row.ratio : ""}
                        aria-label={t("unitRatio", { name: labelOf(row, i), next: labelOf(next, i + 1) })}
                        onChange={(e) => patchRow(i, { ratio: e.target.valueAsNumber })}
                        className={cn("h-8 w-20 shrink-0 rounded-md text-sm @xl:h-10", FIELD)}
                      />
                      <span className="min-w-0 truncate">{labelOf(next, i + 1)}</span>
                    </>
                  ) : (
                    <span className="truncate text-xs @xl:text-sm">{t("base")}</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="col-start-3 row-start-1 size-10 text-muted-foreground @xl:col-start-4"
                  disabled={rows.length === 1}
                  aria-label={t("remove", { name: labelOf(row, i) })}
                  onClick={() => setRows((current) => current.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length >= MAX_CURRENCY_UNITS}
          onClick={() => setRows((current) => [{ name: "", short: "", ratio: NEW_UNIT_RATIO }, ...current])}
        >
          <Plus className="size-4" />
          {t("add")}
        </Button>
        {!valid && <p className="text-xs text-destructive">{t("invalid")}</p>}
      </section>
    </div>
  );
}
