"use client";

import { useTranslations } from "next-intl";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import { daysInMonth } from "@/lib/worldTimeline";

/**
 * Une date de chronologie en trois champs — année, mois, jour — sur une
 * ligne, pour les formulaires étroits (le panneau d'un lieu fait 340 px).
 *
 * L'année vide vaut « pas de date » : c'est ce qui rend `null`, sans case à
 * cocher. Le mois se choisit parmi ceux du monde, le jour n'apparaît qu'une
 * fois le mois posé — un jour sans mois ne veut rien dire.
 */
export function TimelineDateFields({
  label,
  value,
  onChange,
  config,
}: {
  /** Nomme le champ d'année — c'est lui qui porte la date. */
  label: string;
  value: WorldTimelineDate | null;
  onChange: (next: WorldTimelineDate | null) => void;
  config: WorldTimelineConfig;
}) {
  const t = useTranslations("chatrooms");
  const champ =
    "h-7 rounded-md border border-border-soft bg-background px-1.5 text-xs outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:w-auto sm:normal-case sm:font-normal sm:tracking-normal">
        {label}
      </span>
      <input
        type="number"
        aria-label={label}
        placeholder={config.year_label}
        value={value?.year ?? ""}
        onChange={(e) => {
          const brut = e.target.value.trim();
          if (brut === "") { onChange(null); return; }
          const year = parseInt(brut, 10);
          if (Number.isNaN(year)) return;
          onChange({ year, month: value?.month ?? null, day: value?.day ?? null });
        }}
        className={`${champ} w-20`}
      />
      {value && config.month_names.length > 0 && (
        <select
          aria-label={t("month")}
          value={value.month ?? ""}
          onChange={(e) =>
            onChange({ ...value, month: e.target.value === "" ? null : Number(e.target.value), day: null })
          }
          className={`${champ} max-w-28`}
        >
          <option value="">—</option>
          {config.month_names.map((nom, i) => (
            <option key={i} value={i}>{nom}</option>
          ))}
        </select>
      )}
      {value && value.month !== null && (
        <input
          type="number"
          aria-label={t("day")}
          min={1}
          max={daysInMonth(config, value.month)}
          placeholder="—"
          value={value.day ?? ""}
          onChange={(e) => {
            const brut = e.target.value;
            if (brut === "") { onChange({ ...value, day: null }); return; }
            const max = daysInMonth(config, value.month!);
            onChange({ ...value, day: Math.min(max, Math.max(1, parseInt(brut, 10) || 1)) });
          }}
          className={`${champ} w-14`}
        />
      )}
    </div>
  );
}
