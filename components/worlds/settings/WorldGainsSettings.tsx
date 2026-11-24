"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { AmountInput } from "@/components/economy/AmountInput";
import { setWorldGains } from "@/app/actions/worldCatalog";
import { messageErreurAction } from "@/lib/actionErrors";
import { currencyUnitsOf } from "@/lib/worldCurrency";
import { GAIN_KINDS, MAX_GAIN_COOLDOWN_MINUTES, gainSettingsOf, gainSettingsSchema, type GainKind, type GainSettings } from "@/lib/worldGains";
import type { World } from "@/types/worlds";
import { SettingsSection, ToggleItem, ToggleList } from "./FeatureLayout";

const columnOf = (kind: GainKind) => `gain_${kind}` as const;

/**
 * Les gains proposés dans les réglages. Ceux des scènes (rejointe, créée,
 * terminée) sont masqués pour l'instant (demande du 2026-11-24) : la base
 * sait les payer, leurs montants restent tels qu'enregistrés (zéro par défaut).
 */
const SHOWN_GAIN_KINDS: readonly GainKind[] = GAIN_KINDS.filter((k) => k === "message" || k === "daily_login");

/**
 * Les gains automatiques (migrations 252, 253), dans la page Devises : un
 * montant par déclencheur, saisi palier par palier (zéro : rien), le délai
 * entre deux messages payés et le plafond par jour, enregistrés d'un bouton.
 * La base paie.
 */
export function WorldGainsSettings({ world, onUpdated }: { world: World; onUpdated?: (patch: Partial<World>) => void }) {
  const t = useTranslations("worlds.settings.gainsForm");
  const tCommon = useTranslations("common");
  const units = React.useMemo(() => currencyUnitsOf(world.currency_units), [world.currency_units]);
  const [saved, setSaved] = React.useState<GainSettings>(() => gainSettingsOf(world));
  const [draft, setDraft] = React.useState<GainSettings>(saved);
  const [cooldown, setCooldown] = React.useState<number | null>(saved.gain_message_cooldown);
  const [saving, setSaving] = React.useState(false);

  const settings: GainSettings = { ...draft, gain_message_cooldown: cooldown ?? 0 };
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
      stepper
      units={units}
      value={value}
      onChange={onChange}
      idPrefix={id}
      labelOf={(unit) => t("amountIn", { label, unit: unit.name })}
    />
  );

  return (
    <SettingsSection title={t("title")} help={t("help")}>
      <ToggleList label={t("events")}>
        {SHOWN_GAIN_KINDS.map((kind) => (
          <React.Fragment key={kind}>
            <ToggleItem
              title={t(kind)}
              help={t(`${kind}Help`)}
              control={amount(t(kind), `gain-${kind}`, draft[columnOf(kind)] || null, (v) =>
                setDraft((d) => ({ ...d, [columnOf(kind)]: v ?? 0 })),
              )}
            />
            {/* Le délai ne règle que le gain par message : sa sous-option. */}
            {kind === "message" && (
              <ToggleItem
                indent
                title={t("cooldown")}
                help={t("cooldownHelp")}
                control={
                  <NumberInput
                    min={0}
                    max={MAX_GAIN_COOLDOWN_MINUTES}
                    aria-label={t("cooldown")}
                    value={cooldown}
                    onValueChange={setCooldown}
                  />
                }
              />
            )}
          </React.Fragment>
        ))}
      </ToggleList>
      {/* Le plafond borne tous les gains à la fois : hors de la liste. */}
      <ToggleList label={t("cap")} className="mt-3">
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
