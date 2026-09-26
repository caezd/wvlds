"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";

import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import { clampTimelineDate, currentPeriodLock, daysInMonth, formatTimelineLabel } from "@/lib/worldTimeline";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Le choix de la date d'un salon, sur une seule ligne : jour, mois, année.
 *
 * Il existait en deux exemplaires — le compositeur et les réglages du salon —
 * qui bornaient tous deux le jour à 31 quelle que soit la longueur du mois.
 * Il n'y en a plus qu'un, qui suit le calendrier du monde : un jour ne dépasse
 * pas son mois, et la période en cours, quand le monde l'impose, fige l'année
 * (et le mois, s'il y en a un) — ils s'affichent alors en clair, avec un
 * cadenas, au lieu d'être proposés au choix.
 *
 * `onCommit` reçoit une date déjà ramenée dans ce que le monde permet ; c'est
 * l'appelant qui décide de l'enregistrer tout de suite ou à la validation.
 */
export function TimelineDatePicker({
  config,
  value,
  onCommit,
  disabled,
  dense,
}: {
  config: WorldTimelineConfig;
  value: WorldTimelineDate;
  onCommit: (date: WorldTimelineDate) => void;
  disabled?: boolean;
  /** Dans un cadre déjà bordé (la ligne sous le titre d'un salon) : plus bas,
   * et la période figée sans second cadre. */
  dense?: boolean;
}) {
  const t = useTranslations("worlds.timelinePicker");
  const lock = currentPeriodLock(config);
  const date = clampTimelineDate(config, value);
  const [anneeSaisie, setAnneeSaisie] = React.useState(String(date.year));
  const [jourSaisi, setJourSaisi] = React.useState(date.day === null ? "" : String(date.day));

  // Une date venue d'ailleurs (un autre onglet, une réinitialisation) remplace
  // la saisie en cours.
  React.useEffect(() => { setAnneeSaisie(String(date.year)); }, [date.year]);
  React.useEffect(() => { setJourSaisi(date.day === null ? "" : String(date.day)); }, [date.day]);

  function commit(next: Partial<WorldTimelineDate>) {
    onCommit(clampTimelineDate(config, { ...date, ...next }));
  }

  const aDesMois = config.month_names.length > 0;
  const joursMax = date.month === null ? null : daysInMonth(config, date.month);
  const periode = formatTimelineLabel(config, { year: config.current_year, month: lock.month, day: null });
  const annee = config.year_label || t("year");
  const hauteur = dense ? "h-7" : "h-8";

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="timeline-date-picker">
      {/* Jour : seulement dans un mois, et jamais au-delà de sa longueur */}
      {joursMax !== null && (
        <Input
          type="number"
          min={1}
          max={joursMax}
          aria-label={t("day")}
          placeholder={t("dayPlaceholder", { max: joursMax })}
          className={cn(hauteur, "w-20 text-sm")}
          value={jourSaisi}
          disabled={disabled}
          onChange={(e) => setJourSaisi(e.target.value)}
          onBlur={() => {
            const brut = parseInt(jourSaisi, 10);
            // Ramené dans le mois tout de suite : un « 45 » borné à 28 doit
            // se voir 28, même si la date retenue n'a pas changé.
            const suivante = clampTimelineDate(config, { ...date, day: Number.isNaN(brut) ? null : brut });
            setJourSaisi(suivante.day === null ? "" : String(suivante.day));
            if (suivante.day !== date.day) onCommit(suivante);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      )}

      {/* Le mois, au choix — sauf quand la période en cours le fige. */}
      {aDesMois && lock.month === null && (
        <select
          aria-label={t("month")}
          value={date.month ?? ""}
          disabled={disabled}
          className={cn(hauteur, "min-w-28 flex-1 rounded-lg border border-border bg-transparent px-2 text-sm")}
          onChange={(e) => commit({ month: e.target.value === "" ? null : Number(e.target.value), day: null })}
        >
          <option value="">{t("noMonth")}</option>
          {config.month_names.map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>
      )}

      {lock.year !== null ? (
        // La période imposée par le monde : lue, pas choisie.
        <p
          className={cn(
            hauteur,
            "flex items-center gap-1.5 text-sm",
            !dense && "rounded-lg border border-dashed border-border px-2.5",
          )}
          title={t("lockedHint", { period: periode })}
          data-testid="timeline-period-lock"
        >
          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span>{periode}</span>
          <span className="sr-only">{t("lockedHint", { period: periode })}</span>
        </p>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground" aria-hidden>{annee}</span>
          <Input
            type="number"
            aria-label={t("yearOf", { label: annee })}
            className={cn(hauteur, "w-24 text-sm")}
            value={anneeSaisie}
            disabled={disabled}
            onChange={(e) => setAnneeSaisie(e.target.value)}
            onBlur={() => {
              const y = parseInt(anneeSaisie, 10);
              if (Number.isNaN(y)) setAnneeSaisie(String(date.year));
              else if (y !== date.year) commit({ year: y });
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          {config.era_name && <span className="text-xs text-muted-foreground">{config.era_name}</span>}
        </div>
      )}
    </div>
  );
}
