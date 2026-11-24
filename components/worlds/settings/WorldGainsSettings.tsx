"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/economy/AmountInput";
import { setWorldGains } from "@/app/actions/worldCatalog";
import { messageErreurAction } from "@/lib/actionErrors";
import { cn } from "@/lib/utils";
import { currencyUnitsOf } from "@/lib/worldCurrency";
import { GAIN_KINDS, MAX_GAIN_COOLDOWN_MINUTES, gainSettingsOf, gainSettingsSchema, type GainKind, type GainSettings } from "@/lib/worldGains";
import type { World } from "@/types/worlds";
import { FIELD, SettingsSection, ToggleItem, ToggleList } from "./FeatureLayout";

const columnOf = (kind: GainKind) => `gain_${kind}` as const;

/**
 * Les montants des gains automatiques (Paramètres › Fonctions › Économie ›
 * Gains, migration 252) : un par déclencheur, saisi palier par palier ; le
 * délai entre deux messages payés et le plafond par jour. Enregistrés d'un
 * bouton ; la base paie.
 */
export function WorldGainsSettings({ world, onUpdated }: { world: World; onUpdated?: (patch: Partial<World>) => void }) {
  const t = useTranslations("worlds.settings.gainsForm");
  const tCommon = useTranslations("common");
  const units = React.useMemo(() => currencyUnitsOf(world.currency_units), [world.currency_units]);
  const [saved, setSaved] = React.useState<GainSettings>(() => gainSettingsOf(world));
  const [draft, setDraft] = React.useState<GainSettings>(saved);
  const [cooldown, setCooldown] = React.useState(String(saved.gain_message_cooldown));
  const [saving, setSaving] = React.useState(false);

  const settings: GainSettings = {
    ...draft,
    gain_message_cooldown: cooldown.trim() === "" ? 0 : Number(cooldown),
  };
  const valid = gainSettingsSchema.safeParse(settings).success;
  const dirty = (Object.keys(settings) as (keyof GainSettings)[]).some((k) => settings[k] !== saved[k]);

  async function save() {
    setSaving(true);
    const res = await setWorldGains(world.id, settings);
    setSaving(false);
    if (!res.ok) {
      toast.error(messageErreurAction(res.error, tCommon));
      return;
    }
    setSaved(settings);
    onUpdated?.(settings);
    toast.success(t("saved"));
  }

  const amount = (label: string, id: string, value: number | null, onChange: (v: number | null) => void) => (
    <AmountInput
      units={units}
      value={value}
      onChange={onChange}
      idPrefix={id}
      labelOf={(unit) => t("amountIn", { label, unit: unit.name })}
    />
  );

  return (
    <SettingsSection title={t("title")}>
      <ToggleList>
        {GAIN_KINDS.map((kind) => (
          <ToggleItem
            key={kind}
            title={t(kind)}
            help={t(`${kind}Help`)}
            control={amount(t(kind), `gain-${kind}`, draft[columnOf(kind)] || null, (v) =>
              setDraft((d) => ({ ...d, [columnOf(kind)]: v ?? 0 })),
            )}
          />
        ))}
        <ToggleItem
          title={t("cooldown")}
          help={t("cooldownHelp")}
          control={
            <Input
              type="number"
              min={0}
              max={MAX_GAIN_COOLDOWN_MINUTES}
              step={1}
              inputMode="numeric"
              aria-label={t("cooldown")}
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
              className={cn("h-9 w-28 shrink-0 rounded-md text-sm", FIELD)}
            />
          }
        />
        <ToggleItem
          title={t("cap")}
          help={t("capHelp")}
          control={amount(t("cap"), "gain-cap", draft.gain_daily_cap, (v) => setDraft((d) => ({ ...d, gain_daily_cap: v })))}
        />
      </ToggleList>
      <div className="mt-3 flex items-center gap-3">
        {dirty && !valid && <p className="text-xs text-destructive">{t("invalid")}</p>}
        <Button type="button" size="sm" className="ml-auto" disabled={!dirty || !valid || saving} onClick={() => void save()}>
          {t("save")}
        </Button>
      </div>
    </SettingsSection>
  );
}
