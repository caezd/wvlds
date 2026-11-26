"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/economy/AmountInput";
import { SignedAmountInput } from "@/components/economy/SignedAmountInput";
import { setWorldGains } from "@/app/actions/worldCatalog";
import { useAutoSave } from "@/hooks/useAutoSave";
import { messageErreurAction } from "@/lib/actionErrors";
import { digitsOnly } from "@/lib/digitsOnly";
import { currencyUnitsOf } from "@/lib/worldCurrency";
import { GAIN_KINDS, MAX_GAIN_COOLDOWN_MINUTES, dayStartLabel, gainSettingsOf, gainSettingsSchema, type GainKind, type GainSettings } from "@/lib/worldGains";
import type { World } from "@/types/worlds";
import { cn } from "@/lib/utils";
import { AutoSaveIndicator } from "./AutoSaveIndicator";
import { SectionLabel } from "@/components/ui/section-label";
import { FIELD, SettingsSection } from "./FeatureLayout";

const columnOf = (kind: GainKind) => `gain_${kind}` as const;

/**
 * Les gains proposés dans les réglages. Ceux des scènes (rejointe, créée,
 * terminée) sont masqués pour l'instant (demande du 2026-11-24) : la base
 * sait les payer, leurs montants restent tels qu'enregistrés (zéro par défaut).
 */
const SHOWN_GAIN_KINDS: readonly GainKind[] = GAIN_KINDS.filter((k) => k === "message" || k === "daily_login");

/**
 * Les gains automatiques (migrations 252, 253), dans la page Devises : un
 * montant par déclencheur, saisi palier par palier (vide ou zéro : rien ;
 * « − » : retire, migration 261),
 * puis, dans une seconde section, les limites — délai entre deux messages
 * payés, plafond par jour. Chaque modification valide s'enregistre
 * d'elle-même (useAutoSave). La base paie.
 */
export function WorldGainsSettings({ world, onUpdated }: { world: World; onUpdated?: (patch: Partial<World>) => void }) {
  const t = useTranslations("worlds.settings.gainsForm");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const units = React.useMemo(() => currencyUnitsOf(world.currency_units), [world.currency_units]);
  // La base compte en jours UTC : on dit à quelle heure de l'appareil la journée commence.
  const dayStart = dayStartLabel(locale);
  const [draft, setDraft] = React.useState<GainSettings>(() => gainSettingsOf(world));
  const [cooldown, setCooldown] = React.useState<number | null>(draft.gain_message_cooldown);

  const settings: GainSettings = { ...draft, gain_message_cooldown: cooldown ?? 0 };
  const valid = gainSettingsSchema.safeParse(settings).success;

  const { status, flush } = useAutoSave({
    value: settings,
    valid,
    save: async (next) => {
      const res = await setWorldGains(world.id, next);
      if (!res.ok) {
        toast.error(messageErreurAction(res.error, tCommon));
        return false;
      }
      onUpdated?.(next);
      return true;
    },
  });
  const indicator = <AutoSaveIndicator status={status} />;

  const amount = (label: string, id: string, value: number | null, onChange: (v: number | null) => void, placeholder: string) => (
    <AmountInput
      compact
      units={units}
      value={value}
      onChange={onChange}
      idPrefix={id}
      placeholder={placeholder}
      fieldClassName={FIELD}
      labelOf={(unit) => t("amountIn", { label, unit: unit.name })}
    />
  );

  const cap = draft.gain_daily_cap;

  // À plat, sans carte : un réglage par ligne, les champs alignés à droite.
  // Une section : ce qui rapporte, puis ce qui le limite.
  return (
    <SettingsSection title={t("title")} description={t("help")} aside={indicator}>
      {/* Leur propre conteneur : la disposition suit la largeur de la colonne, pas celle de la page. */}
      <div className="@container grid gap-y-4" onBlur={flush}>
          {SHOWN_GAIN_KINDS.map((kind) => {
            const value = draft[columnOf(kind)];
            return (
              <GainField
                key={kind}
                label={t(kind)}
                description={t(`${kind}Help`, { time: dayStart })}
                status={value === 0 ? t("nothing") : value < 0 ? t("loss") : null}
              >
                {/* Un gain peut retirer (migration 261) : son sens devant les cases. */}
                <SignedAmountInput
                  compact
                  units={units}
                  value={value || null}
                  onChange={(v) => setDraft((d) => ({ ...d, [columnOf(kind)]: v ?? 0 }))}
                  idPrefix={`gain-${kind}`}
                  placeholder="0"
                  fieldClassName={FIELD}
                  labelOf={(unit) => t("amountIn", { label: t(kind), unit: unit.name })}
                  signLabel={t("sign", { label: t(kind) })}
                />
              </GainField>
            );
          })}
      </div>
      <div role="group" aria-labelledby="gains-limits" className="@container grid gap-y-4 border-t border-border pt-4" onBlur={flush}>
          <SectionLabel as="p" id="gains-limits">{t("limits")}</SectionLabel>
          <GainField label={t("cooldown")} description={t("cooldownHelp")} status={!cooldown ? t("noCooldown") : null}>
            <div className="relative">
              <Input
                type="number"
                inputMode="numeric"
                {...digitsOnly}
                min={0}
                max={MAX_GAIN_COOLDOWN_MINUTES}
                step={1}
                aria-label={t("cooldownLabel")}
                placeholder="0"
                value={cooldown || ""}
                onChange={(e) => setCooldown(e.target.value.trim() === "" ? null : e.target.valueAsNumber)}
                className={cn(NUMBER_FIELD, FIELD)}
              />
              <span aria-hidden className={SUFFIX}>
                {t("minutes")}
              </span>
            </div>
          </GainField>
          {/* Le plafond borne tous les gains à la fois. Vide : sans plafond ; zéro : plus rien. */}
          <GainField
            label={t("cap")}
            description={t("capHelp", { time: dayStart })}
            status={cap === null ? t("noCap") : cap === 0 ? t("zeroCap") : null}
            warn={cap === 0}
          >
            {amount(t("cap"), "gain-cap", cap, (v) => setDraft((d) => ({ ...d, gain_daily_cap: v })), "—")}
          </GainField>
      </div>
      {!valid && <p className="text-xs text-destructive">{t("invalid")}</p>}
    </SettingsSection>
  );
}

/** Une case numérique, l'unité dans la case (voir AmountInput `compact`). */
const NUMBER_FIELD =
  "h-10 rounded-md pr-10 text-sm tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const SUFFIX = "pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center text-xs text-muted-foreground";

/**
 * Un réglage : son libellé, son aide et ce que veut dire la valeur quand
 * elle est vide ou nulle (« Ne rapporte rien », « Sans plafond »), puis ses
 * champs. Côte à côte seulement quand la colonne laisse au libellé de quoi
 * respirer (@2xl) : un paragraphe d'aide sur six lignes ne se lit pas.
 */
function GainField({
  label,
  description,
  status,
  warn = false,
  children,
}: {
  label: string;
  description: string;
  status: string | null;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="grid items-center gap-x-4 gap-y-1.5 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {status && <p className={cn("text-xs", warn ? "text-destructive" : "text-muted-foreground")}>{status}</p>}
      </div>
      {children}
    </div>
  );
}
