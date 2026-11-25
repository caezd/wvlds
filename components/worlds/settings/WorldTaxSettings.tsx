"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { enUS, es, fr } from "react-day-picker/locale";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AmountInput } from "@/components/economy/AmountInput";
import { setWorldTax } from "@/app/actions/worldTax";
import { messageErreurAction } from "@/lib/actionErrors";
import { currencyUnitsOf } from "@/lib/worldCurrency";
import {
  MAX_TAX_BADGE_LENGTH,
  MAX_TAX_EVERY,
  TAX_MODES,
  TAX_UNITS,
  taxSettingsOf,
  taxSettingsSchema,
  type TaxMode,
  type TaxSettings,
  type TaxUnit,
} from "@/lib/worldTax";
import type { World } from "@/types/worlds";
import { cn } from "@/lib/utils";
import { FIELD, SettingsSection, ToggleItem, ToggleList } from "./FeatureLayout";

const SELECT_CLASS =
  "h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary";

const CALENDAR_LOCALES = { fr, en: enUS, es } as const;

/**
 * La taxe des personas (migration 255), dans la page Devises : un montant
 * fixe par période, la récurrence et son départ, le mode de paiement, et ce
 * qu'il advient des retards. Enregistrée d'un bouton ; la base tient les
 * dettes, les échéances et les prélèvements.
 */
export function WorldTaxSettings({ world, onUpdated }: { world: World; onUpdated?: (patch: Partial<World>) => void }) {
  const t = useTranslations("worlds.settings.taxForm");
  const tTax = useTranslations("personas.tax");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const units = React.useMemo(() => currencyUnitsOf(world.currency_units), [world.currency_units]);
  const [saved, setSaved] = React.useState<TaxSettings>(() => taxSettingsOf(world));
  const [draft, setDraft] = React.useState<TaxSettings>(saved);
  const [every, setEvery] = React.useState<number | null>(saved.tax_every);
  const [badge, setBadge] = React.useState(saved.tax_badge_label ?? "");
  const [saving, setSaving] = React.useState(false);
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  const settings: TaxSettings = {
    ...draft,
    tax_every: every ?? 0,
    tax_badge_label: badge.trim() ? badge.trim() : null,
  };
  const valid = taxSettingsSchema.safeParse(settings).success;
  const dirty = (Object.keys(settings) as (keyof TaxSettings)[]).some((k) => settings[k] !== saved[k]);
  const set = (patch: Partial<TaxSettings>) => setDraft((d) => ({ ...d, ...patch }));

  async function save() {
    setSaving(true);
    const res = await setWorldTax(world.id, settings);
    setSaving(false);
    if (!res.ok) {
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    setSaved(settings);
    onUpdated?.(settings);
    toast.success(t("saved"));
  }

  const anchor = new Date(draft.tax_anchor);
  const anchorLabel = anchor.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <SettingsSection title={t("title")} help={t("help")}>
      <ToggleList>
        <ToggleItem title={t("enable")} checked={draft.tax_enabled} onCheckedChange={(v) => set({ tax_enabled: v })} />
        <ToggleItem
          title={t("amount")}
          control={
            <div className="w-56 shrink-0">
              <AmountInput
                compact
                units={units}
                value={draft.tax_amount || null}
                onChange={(v) => set({ tax_amount: v ?? 0 })}
                idPrefix="tax-amount"
                placeholder="0"
                fieldClassName={FIELD}
                labelOf={(unit) => t("amountIn", { label: t("amountLabel"), unit: unit.name })}
              />
            </div>
          }
        />
        <ToggleItem
          title={t("recurrence")}
          control={
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("every")}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_TAX_EVERY}
                step={1}
                aria-label={t("every")}
                value={every ?? ""}
                onChange={(e) => setEvery(e.target.value.trim() === "" ? null : e.target.valueAsNumber)}
                className={cn("h-9 w-16 tabular-nums", FIELD)}
              />
              <select
                aria-label={t("unitLabel")}
                className={SELECT_CLASS}
                value={draft.tax_unit}
                onChange={(e) => set({ tax_unit: e.target.value as TaxUnit })}
              >
                {TAX_UNITS.map((u) => (
                  <option key={u} value={u}>{t(`units.${u}`, { count: every ?? 1 })}</option>
                ))}
              </select>
            </div>
          }
        />
        <ToggleItem
          title={t("anchor")}
          help={t("anchorHelp")}
          control={
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`${t("anchor")} : ${anchorLabel}`}
                  className="h-9 shrink-0 justify-start font-normal"
                >
                  <CalendarDays className="mr-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  {anchorLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="single"
                  required
                  locale={CALENDAR_LOCALES[locale as keyof typeof CALENDAR_LOCALES] ?? fr}
                  selected={anchor}
                  defaultMonth={anchor}
                  onSelect={(d) => {
                    if (!d) return;
                    // Minuit local du jour choisi.
                    set({ tax_anchor: new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString() });
                    setCalendarOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          }
        />
        <ToggleItem
          title={t("mode")}
          help={t("modeHelp")}
          control={
            <select
              aria-label={t("mode")}
              className={cn(SELECT_CLASS, "shrink-0")}
              value={draft.tax_mode}
              onChange={(e) => set({ tax_mode: e.target.value as TaxMode })}
            >
              {TAX_MODES.map((m) => (
                <option key={m} value={m}>{t(`modes.${m}`)}</option>
              ))}
            </select>
          }
        />
        <ToggleItem
          title={t("accumulate")}
          help={t("accumulateHelp")}
          checked={draft.tax_accumulate}
          onCheckedChange={(v) => set({ tax_accumulate: v })}
        />
        <ToggleItem
          title={t("grace")}
          help={t("graceHelp")}
          checked={draft.tax_grace_new}
          onCheckedChange={(v) => set({ tax_grace_new: v })}
        />
        <ToggleItem
          title={t("badge")}
          help={t("badgeHelp")}
          control={
            <Input
              aria-label={t("badge")}
              maxLength={MAX_TAX_BADGE_LENGTH}
              placeholder={tTax("badge")}
              value={badge}
              onChange={(e) => setBadge(e.target.value)}
              className={cn("h-9 w-44 shrink-0", FIELD)}
            />
          }
        />
      </ToggleList>
      <div className="flex items-center gap-3">
        {dirty && !valid && <p className="text-xs text-destructive">{t("invalid")}</p>}
        <Button type="button" size="sm" className="ml-auto" disabled={!dirty || !valid || saving} onClick={() => void save()}>
          {t("save")}
        </Button>
      </div>
    </SettingsSection>
  );
}
