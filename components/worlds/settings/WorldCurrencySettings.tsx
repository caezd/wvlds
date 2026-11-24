"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setWorldCurrency } from "@/app/actions/worldCatalog";
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
import { FIELD, SETTINGS_ROW, SettingsSection } from "./FeatureLayout";

/** Le taux proposé pour un palier ajouté au-dessus des autres. */
const NEW_UNIT_RATIO = 10;

/**
 * La monnaie d'un monde (Paramètres › Fonctions › Économie, migration 246) :
 * ses paliers, du plus grand au plus petit, chacun exprimé en nombre du
 * suivant (« 1 Or = 100 Argent »). La base ne garde que les valeurs absolues ;
 * l'éditeur passe par les taux, plus naturels à saisir.
 *
 * Plusieurs champs pour un seul réglage : on enregistre d'un bouton.
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
  const [saved, setSaved] = React.useState<CurrencyUnit[]>(() => currencyUnitsOf(world.currency_units));
  const [rows, setRows] = React.useState<CurrencyRatioRow[]>(() => ratioRowsOf(saved));
  const [saving, setSaving] = React.useState(false);

  const units = React.useMemo(
    () => unitsFromRatioRows(rows.map((r) => ({ ...r, name: r.name.trim(), short: r.short.trim() }))),
    [rows],
  );
  const valid = currencyUnitsSchema.safeParse(units).success;
  const dirty = JSON.stringify(units) !== JSON.stringify(saved);

  const patchRow = (i: number, patch: Partial<CurrencyRatioRow>) =>
    setRows((current) => current.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const labelOf = (row: CurrencyRatioRow, i: number) => row.name.trim() || t("fallbackName", { n: i + 1 });

  async function save() {
    setSaving(true);
    const res = await setWorldCurrency(world.id, units);
    setSaving(false);
    if (!res.ok) {
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    setSaved(units);
    onUpdated?.({ currency_units: units });
    toast.success(t("saved"));
  }

  // L'exemple : cinq fois le deuxième plus petit palier, écrit en unités de base.
  const base = units[units.length - 1];
  const second = units[units.length - 2];
  const example =
    valid && second
      ? `${5 * second.value} ${base.short || base.name} = ${formatAmount(5 * second.value, units)}`
      : null;

  return (
    <SettingsSection title={t("title")} help={t("help")} meta={example}>
      <div className="space-y-2">
        {rows.map((row, i) => {
          const next = rows[i + 1];
          return (
            <div key={i} className={cn(SETTINGS_ROW, "flex-nowrap gap-2")}>
              <Input
                value={row.name}
                maxLength={MAX_CURRENCY_NAME_LENGTH}
                placeholder={t("namePlaceholder")}
                aria-label={t("unitName", { n: i + 1 })}
                onChange={(e) => patchRow(i, { name: e.target.value })}
                className={cn("h-8 w-32 min-w-0 shrink rounded-md text-sm", FIELD)}
              />
              <Input
                value={row.short}
                maxLength={MAX_CURRENCY_SHORT_LENGTH}
                placeholder={t("shortPlaceholder")}
                aria-label={t("unitShort", { n: i + 1 })}
                onChange={(e) => patchRow(i, { short: e.target.value })}
                className={cn("h-8 w-16 shrink-0 rounded-md text-sm", FIELD)}
              />
              {next ? (
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
                  =
                  <Input
                    type="number"
                    min={2}
                    step={1}
                    value={Number.isFinite(row.ratio) ? row.ratio : ""}
                    aria-label={t("unitRatio", { name: labelOf(row, i), next: labelOf(next, i + 1) })}
                    onChange={(e) => patchRow(i, { ratio: e.target.valueAsNumber })}
                    className={cn("h-8 w-20 shrink-0 rounded-md text-sm", FIELD)}
                  />
                  <span className="truncate">{labelOf(next, i + 1)}</span>
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{t("base")}</span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
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
        <Button type="button" size="sm" className="ml-auto" disabled={!dirty || !valid || saving} onClick={() => void save()}>
          {t("save")}
        </Button>
      </div>
      {dirty && !valid && <p className="mt-2 text-xs text-destructive">{t("invalid")}</p>}
    </SettingsSection>
  );
}
