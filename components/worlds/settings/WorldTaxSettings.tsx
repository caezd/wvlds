"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { enUS, es, fr } from "react-day-picker/locale";
import { CalendarDays, Shapes } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AmountInput } from "@/components/economy/AmountInput";
import { DEFAULT_COLOR_PRESETS } from "@/components/ui/hsv-color-picker";
import { LucideIconPicker } from "@/components/ui/LucideIconPicker";
import { TaxBadgeView } from "@/components/personas/PersonaTaxBadge";
import { ColorPickerButton } from "./ColorPickerButton";
import { setWorldTax } from "@/app/actions/worldTax";
import { useAutoSave } from "@/hooks/useAutoSave";
import { AutoSaveIndicator } from "./AutoSaveIndicator";
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
import { FIELD, InactiveOptions, SettingsSection, TitleWithHelp, ToggleItem, ToggleList } from "./FeatureLayout";

const SELECT_CLASS =
  "h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary";

const CALENDAR_LOCALES = { fr, en: enUS, es } as const;

/**
 * La taxe des personas (migration 255), dans la page Devises : un montant
 * fixe par période, la récurrence et son départ, le mode de paiement, et ce
 * qu'il advient des retards. Chaque modification valide s'enregistre
 * d'elle-même (useAutoSave) ; la couleur du badge, à la fermeture de son
 * sélecteur. La base tient les dettes, les échéances et les prélèvements.
 */
export function WorldTaxSettings({ world, onUpdated }: { world: World; onUpdated?: (patch: Partial<World>) => void }) {
  const t = useTranslations("worlds.settings.taxForm");
  const tTax = useTranslations("personas.tax");
  const tCommon = useTranslations("common");
  const tIcon = useTranslations("iconPicker");
  const locale = useLocale();
  const units = React.useMemo(() => currencyUnitsOf(world.currency_units), [world.currency_units]);
  const [draft, setDraft] = React.useState<TaxSettings>(() => taxSettingsOf(world));
  const [every, setEvery] = React.useState<number | null>(draft.tax_every);
  const [badge, setBadge] = React.useState(draft.tax_badge_label ?? "");
  // La couleur en cours de choix : l'aperçu la suit, l'envoi attend la fermeture du sélecteur.
  const [pendingColor, setPendingColor] = React.useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  const settings: TaxSettings = {
    ...draft,
    tax_every: every ?? 0,
    tax_badge_label: badge.trim() ? badge.trim() : null,
  };
  const valid = taxSettingsSchema.safeParse(settings).success;
  const set = (patch: Partial<TaxSettings>) => setDraft((d) => ({ ...d, ...patch }));

  const { status, flush } = useAutoSave({
    value: settings,
    valid,
    save: async (next) => {
      const res = await setWorldTax(world.id, next);
      if (!res.ok) {
        toast.error(messageErreurAction(res.error, tCommon));
        return false;
      }
      onUpdated?.(next);
      return true;
    },
  });

  const anchor = new Date(draft.tax_anchor);
  const anchorLabel = anchor.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <SettingsSection title={t("title")} description={t("help")} aside={<AutoSaveIndicator status={status} />}>
      <div onBlur={flush}>
        <ToggleList>
          <ToggleItem title={t("enable")} checked={draft.tax_enabled} onCheckedChange={(v) => set({ tax_enabled: v })} />
          {/* Désactivée : ses options restent visibles, grisées et inertes. */}
          <InactiveOptions inactive={!draft.tax_enabled}>
            <div>
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
              <div className="py-3">
                <p className="text-sm font-medium">
                  <TitleWithHelp title={t("mode")} help={t("modeHelp")} />
                </p>
                <RadioGroup
                  aria-label={t("mode")}
                  value={draft.tax_mode}
                  onValueChange={(v) => set({ tax_mode: v as TaxMode })}
                  className="mt-2 gap-0.5"
                >
                  {TAX_MODES.map((m) => (
                    <label
                      key={m}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 transition-colors hover:bg-muted/50"
                    >
                      <RadioGroupItem value={m} />
                      <span className="text-sm">{t(`modes.${m}`)}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <ToggleItem
                title={t("accumulate")}
                description={t("accumulateHelp")}
                checked={draft.tax_accumulate}
                onCheckedChange={(v) => set({ tax_accumulate: v })}
              />
              <ToggleItem
                title={t("grace")}
                description={t("graceHelp")}
                checked={draft.tax_grace_new}
                onCheckedChange={(v) => set({ tax_grace_new: v })}
              />
              <ToggleItem
                title={t("badgeEnabled")}
                checked={draft.tax_badge_enabled}
                onCheckedChange={(v) => set({ tax_badge_enabled: v })}
              />
              <InactiveOptions inactive={!draft.tax_badge_enabled}>
                <div>
                  <ToggleItem
                    title={t("badge")}
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
                  <ToggleItem
                    title={t("badgeStyle")}
                    control={
                      <div className="flex shrink-0 items-center gap-2">
                        <span data-testid="tax-badge-preview" className="flex">
                          <TaxBadgeView
                            label={badge.trim() || tTax("badge")}
                            color={pendingColor ?? draft.tax_badge_color}
                            icon={draft.tax_badge_icon}
                          />
                        </span>
                        <ColorPickerButton
                          color={pendingColor ?? draft.tax_badge_color ?? DEFAULT_COLOR_PRESETS[1].value}
                          onChange={setPendingColor}
                          onClose={() => {
                            if (pendingColor) set({ tax_badge_color: pendingColor });
                            setPendingColor(null);
                          }}
                          className="h-9 w-9"
                        />
                        <LucideIconPicker
                          value={draft.tax_badge_icon ?? ""}
                          onChange={(name) => set({ tax_badge_icon: name || null })}
                          trigger={
                            <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={tIcon("chooseIcon")}>
                              <Shapes className="h-4 w-4" aria-hidden />
                            </Button>
                          }
                        />
                        {(draft.tax_badge_color || draft.tax_badge_icon) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPendingColor(null);
                              set({ tax_badge_color: null, tax_badge_icon: null });
                            }}
                          >
                            {t("resetStyle")}
                          </Button>
                        )}
                      </div>
                    }
                  />
                </div>
              </InactiveOptions>
            </div>
          </InactiveOptions>
        </ToggleList>
      </div>
      {!valid && <p className="text-xs text-destructive">{t("invalid")}</p>}
    </SettingsSection>
  );
}
