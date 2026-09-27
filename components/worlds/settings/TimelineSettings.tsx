"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, Hourglass, Minus, Plus, RotateCcw, X } from "lucide-react";

import type { WorldTimelineAge, WorldTimelineConfig, WorldTimelineHoliday } from "@/types/worlds";
import { DEFAULT_DORMANT_DAYS } from "@/lib/worldTimelineItems";
import {
  clampDaysPerMonth,
  daysInMonth,
  formatTimelineLabel,
  DEFAULT_DAYS_PER_MONTH,
  REAL_DAYS_PER_MONTH,
  REAL_MONTH_NAMES,
} from "@/lib/worldTimeline";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpHint } from "@/components/ui/help-hint";
import { SettingsSection, ToggleItem, ToggleList } from "./FeatureLayout";

/** Le rouge de la date actuelle, comme sur la frise : l'accent en sombre, un rouge franc en clair. */
const NOW_RED_BG = "bg-red-600 dark:bg-accent";
const NOW_RED_TEXT = "text-red-600 dark:text-accent";
const NOW_RED_BORDER = "border-red-600/40 dark:border-accent/40";

/** Un champ sans cadre, dans une ligne bordée. */
const BARE_INPUT = "h-8 border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-0";
/** Un champ numérique sans flèches. */
const NO_SPIN = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/**
 * Les réglages d'une chronologie activée (onglet Fonctions, catégorie
 * Chronologie) : en tête, la date actuelle du monde et où en est le récit ;
 * puis des sections — format des dates, règles des salons, mois du
 * calendrier, saisons, fêtes, ce que montre la frise —, le titre à gauche
 * avec son aide, les réglages à droite.
 *
 * `onDraft` suit la frappe (l'aperçu bouge avec elle) ; `onPersist` enregistre
 * à la sortie du champ, comme le reste de l'onglet.
 */
export function TimelineSettings({
  config,
  onDraft,
  onPersist,
}: {
  config: WorldTimelineConfig;
  onDraft: (patch: Partial<WorldTimelineConfig>) => void;
  onPersist: (patch: Partial<WorldTimelineConfig>) => void;
}) {
  const t = useTranslations("worlds");
  const tSettings = useTranslations("worlds.settings");
  const [newAge, setNewAge] = React.useState<{ name: string; from: string }>({ name: "", from: "" });
  const [newHoliday, setNewHoliday] = React.useState<{ name: string; month: number; day: string }>({ name: "", month: 0, day: "" });
  const ages = config.ages ?? [];
  const holidays = config.holidays ?? [];

  const apercu = formatTimelineLabel(config, {
    year: config.current_year,
    month: config.current_month,
    day: null,
  });
  const nbMois = config.month_names.length;
  const moisCourant = config.current_month !== null && config.current_month < nbMois ? config.current_month : null;
  // La période que la restriction imposerait : l'année, et le mois s'il y en a un.
  const periode = formatTimelineLabel(config, { year: config.current_year, month: moisCourant, day: null });
  const joursParAn = config.month_names.reduce((total, _, i) => total + daysInMonth(config, i), 0);

  function majSaison(i: number, patch: Partial<WorldTimelineAge>, persist: boolean) {
    const next = ages.map((a, j) => (j === i ? { ...a, ...patch } : a));
    if (persist) onPersist({ ages: next });
    else onDraft({ ages: next });
  }

  function ajouterSaison() {
    const name = newAge.name.trim();
    const from = parseInt(newAge.from, 10);
    if (!name || Number.isNaN(from)) return;
    onPersist({ ages: [...ages, { name, from_year: from, to_year: null }].sort((a, b) => a.from_year - b.from_year) });
    setNewAge({ name: "", from: "" });
  }

  function majFete(i: number, patch: Partial<WorldTimelineHoliday>, persist: boolean) {
    const next = holidays.map((h, j) => (j === i ? { ...h, ...patch } : h));
    if (persist) onPersist({ holidays: next });
    else onDraft({ holidays: next });
  }

  /** Un jour saisi : vide, aucun jour (tout le mois) ; sinon borné au mois. */
  function jourDe(value: string, month: number): number | null {
    const day = parseInt(value, 10);
    if (Number.isNaN(day)) return null;
    return Math.min(Math.max(day, 1), daysInMonth(config, month));
  }

  function ajouterFete() {
    const name = newHoliday.name.trim();
    if (!name || newHoliday.month >= nbMois) return;
    const fete = { name, month: newHoliday.month, day: jourDe(newHoliday.day, newHoliday.month) };
    onPersist({ holidays: [...holidays, fete].sort((a, b) => a.month - b.month || (a.day ?? 0) - (b.day ?? 0)) });
    setNewHoliday({ name: "", month: newHoliday.month, day: "" });
  }

  // Un mois de plus, nommé d'office « Mois N » : on le renomme dans sa tuile.
  function ajouterMois() {
    onPersist({
      month_names: [...config.month_names, tSettings("newMonthName", { n: nbMois + 1 })],
      days_per_month: [...(config.days_per_month ?? []), DEFAULT_DAYS_PER_MONTH],
    });
  }

  function retirerMois(i: number) {
    const noms = config.month_names.filter((_, j) => j !== i);
    const jours = (config.days_per_month ?? []).filter((_, j) => j !== i);
    const courant = config.current_month;
    onPersist({
      month_names: noms,
      days_per_month: jours,
      // Le mois courant supprimé, ou décalé hors de la liste : on le lâche.
      current_month: courant === null ? null : courant === i ? null : courant > i ? courant - 1 : courant,
    });
  }

  return (
    <div className="space-y-6">
      {/* ── En tête : la date actuelle du monde, et où en est le récit ── */}
      <div className="grid overflow-hidden rounded-xl border border-border-soft bg-card md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col p-5" data-testid="timeline-preview">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Hourglass className="size-3.5" aria-hidden />
            {tSettings("timelinePreviewLabel")}
            <HelpHint title={tSettings("timelinePreviewLabel")}>{tSettings("timelinePreviewHelp")}</HelpHint>
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{apercu}</p>
          {nbMois > 0 && (
            <div className="mt-5 flex gap-1" aria-hidden data-testid="timeline-month-progress">
              {config.month_names.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    moisCourant === null || i > moisCourant ? "bg-muted" : i === moisCourant ? NOW_RED_BG : "bg-muted-foreground/40",
                  )}
                  data-current={i === moisCourant || undefined}
                />
              ))}
            </div>
          )}
          <div className="mt-auto flex justify-between gap-4 pt-3 text-xs tabular-nums text-muted-foreground">
            <span>{moisCourant !== null ? tSettings("monthProgress", { current: moisCourant + 1, total: nbMois }) : null}</span>
            {nbMois > 0 && <span>{tSettings("daysPerYear", { days: joursParAn })}</span>}
          </div>
        </div>

        <section
          aria-label={tSettings("timelineNow")}
          className="space-y-4 border-t border-border-soft p-5 md:border-l md:border-t-0"
        >
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            {tSettings("timelineNow")}
            <HelpHint title={tSettings("timelineNow")}>{tSettings("timelineNowHelp")}</HelpHint>
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="timeline-current-year" className="text-xs font-normal text-muted-foreground">{t("currentYear")}</Label>
            <div className="flex h-10 items-center rounded-lg border border-border">
              <button
                type="button"
                aria-label={tSettings("previousYear")}
                onClick={() => onPersist({ current_year: config.current_year - 1 })}
                className="flex h-full w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <Minus className="size-4" />
              </button>
              <Input
                id="timeline-current-year"
                type="number"
                value={config.current_year}
                min={-99999}
                max={99999}
                className={cn("h-full flex-1 border-0 bg-transparent text-center text-sm shadow-none focus-visible:ring-0", NO_SPIN)}
                onChange={(e) => onDraft({ current_year: Number(e.target.value) || 1 })}
                onBlur={(e) => onPersist({ current_year: Number(e.target.value) || 1 })}
              />
              <button
                type="button"
                aria-label={tSettings("nextYear")}
                onClick={() => onPersist({ current_year: config.current_year + 1 })}
                className="flex h-full w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="timeline-current-month" className="text-xs font-normal text-muted-foreground">{tSettings("currentMonth")}</Label>
            {/* Sans mois défini, le champ reste là mais se tait : il
                disparaissait, et la rangée se retrouvait bancale. */}
            <select
              id="timeline-current-month"
              value={config.current_month ?? ""}
              disabled={nbMois === 0}
              className="h-10 w-full rounded-lg border border-border bg-transparent px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(e) => onPersist({ current_month: e.target.value === "" ? null : Number(e.target.value) })}
            >
              <option value="">{nbMois === 0 ? tSettings("noMonths") : "—"}</option>
              {config.month_names.map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
          </div>
        </section>
      </div>

      {/* ── Comment une date s'écrit ── */}
      <SettingsSection title={tSettings("timelineFormat")} help={tSettings("timelineFormatHelp")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="timeline-year-label" className="text-xs font-normal text-muted-foreground">{t("yearLabel")}</Label>
            <Input
              id="timeline-year-label"
              value={config.year_label}
              placeholder={tSettings("yearPlaceholder")}
              className="h-10 text-sm"
              onChange={(e) => onDraft({ year_label: e.target.value })}
              onBlur={(e) => onPersist({ year_label: e.target.value || tSettings("yearPlaceholder") })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="timeline-era" className="text-xs font-normal text-muted-foreground">
              {t("eraSuffix")}
              <span className="text-muted-foreground/70"> · {tSettings("optional")}</span>
            </Label>
            <Input
              id="timeline-era"
              value={config.era_name ?? ""}
              placeholder={t("eraPlaceholder")}
              className="h-10 text-sm"
              onChange={(e) => onDraft({ era_name: e.target.value || null })}
              onBlur={(e) => onPersist({ era_name: e.target.value || null })}
            />
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Eye className="size-3.5" aria-hidden />
          {tSettings("preview")}
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground" data-testid="timeline-format-preview">
            {apercu}
          </span>
        </p>
      </SettingsSection>

      {/* ── Les salons et la date du monde ── */}
      <SettingsSection title={tSettings("roomRules")} help={tSettings("roomRulesHelp")}>
        <ToggleList>
          <ToggleItem
            title={tSettings("restrictToCurrent")}
            help={tSettings("restrictToCurrentHelp", { period: periode })}
            checked={!!config.restrict_to_current}
            onCheckedChange={(v) => onPersist({ restrict_to_current: v })}
          />
          <ToggleItem
            title={tSettings("requireDate")}
            help={tSettings("requireDateHelp")}
            checked={!!config.require_date}
            onCheckedChange={(v) => onPersist({ require_date: v })}
          />
        </ToggleList>
      </SettingsSection>

      {/* ── Le calendrier ── */}
      {/* Chaque mois porte sa durée (elle borne le choix d'un jour, et le
          calendrier du bloc « Raccourcis chronologie » de l'accueil). Les deux
          tableaux `month_names` / `days_per_month` restent parallèles : tout
          ajout, retrait ou préréglage touche les deux à la fois. */}
      <SettingsSection
        title={t("calendarMonths")}
        help={tSettings("timelineCalendarHelp")}
        meta={nbMois > 0 ? (
          <span data-testid="timeline-year-length">{tSettings("calendarSummary", { months: nbMois, days: joursParAn })}</span>
        ) : undefined}
        aside={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPersist({ month_names: REAL_MONTH_NAMES, days_per_month: REAL_DAYS_PER_MONTH })}
            className="mt-3 h-8 gap-1.5 border-border-soft bg-transparent text-xs font-normal"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {tSettings("useRealMonths")}
          </Button>
        }
      >
        {nbMois > 0 ? (
          <ol className="grid gap-2 sm:grid-cols-2">
            {config.month_names.map((m, i) => (
              <li
                key={i}
                className={cn(
                  "flex h-11 items-center gap-2 rounded-lg border bg-card pl-3 pr-1.5",
                  i === moisCourant ? NOW_RED_BORDER : "border-border-soft",
                )}
                data-current={i === moisCourant || undefined}
              >
                <span className={cn("w-5 shrink-0 text-xs tabular-nums", i === moisCourant ? NOW_RED_TEXT : "text-muted-foreground")}>
                  {i + 1}
                </span>
                <Input
                  value={m}
                  aria-label={t("monthNamePlaceholder")}
                  className={cn(BARE_INPUT, "min-w-0 flex-1 font-medium")}
                  onChange={(e) => {
                    const noms = [...config.month_names];
                    noms[i] = e.target.value;
                    onDraft({ month_names: noms });
                  }}
                  onBlur={(e) => {
                    const noms = [...config.month_names];
                    noms[i] = e.target.value;
                    onPersist({ month_names: noms });
                  }}
                />
                <span className="flex h-8 shrink-0 items-center rounded-md border border-border-soft bg-background pr-2">
                  <Input
                    type="number"
                    aria-label={tSettings("daysInMonth", { month: m || `${i + 1}` })}
                    value={config.days_per_month?.[i] ?? DEFAULT_DAYS_PER_MONTH}
                    min={1}
                    max={999}
                    className={cn(BARE_INPUT, NO_SPIN, "h-full w-10 text-right")}
                    onChange={(e) => {
                      const jours = [...(config.days_per_month ?? [])];
                      jours[i] = clampDaysPerMonth(Number(e.target.value));
                      onDraft({ days_per_month: jours });
                    }}
                    onBlur={(e) => {
                      const jours = [...(config.days_per_month ?? [])];
                      jours[i] = clampDaysPerMonth(Number(e.target.value));
                      onPersist({ days_per_month: jours });
                    }}
                  />
                  <span className="text-xs text-muted-foreground" aria-hidden>{tSettings("daysUnit")}</span>
                </span>
                <button
                  type="button"
                  aria-label={tSettings("deleteMonth", { month: m || `${i + 1}` })}
                  onClick={() => retirerMois(i)}
                  className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs italic text-muted-foreground">{tSettings("noMonthsHint")}</p>
        )}

        <button
          type="button"
          onClick={ajouterMois}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-soft text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden />
          {tSettings("addMonth")}
        </button>
      </SettingsSection>

      {/* ── Les saisons ── */}
      {/* Des âges nommés : ils remplacent, sur la frise, les tranches de cinq
          ans, et ouvrent leurs années d'un bandeau. Sans année de fin, une
          saison court jusqu'à la suivante. */}
      <SettingsSection title={tSettings("timelineAges")} help={tSettings("timelineAgesHelp")}>
        {ages.length > 0 ? (
          <ol className="space-y-2" aria-label={tSettings("timelineAges")}>
            {ages.map((age, i) => (
              <li key={i} className="flex h-11 items-center gap-2 rounded-lg border border-border-soft pl-2 pr-1.5">
                <Input
                  value={age.name}
                  aria-label={tSettings("ageName")}
                  className={cn(BARE_INPUT, "min-w-0 flex-1 font-medium")}
                  onChange={(e) => majSaison(i, { name: e.target.value }, false)}
                  onBlur={(e) => majSaison(i, { name: e.target.value }, true)}
                />
                <Input
                  type="number"
                  value={age.from_year}
                  aria-label={tSettings("ageFrom", { name: age.name })}
                  className={cn(BARE_INPUT, NO_SPIN, "w-16 text-right")}
                  onChange={(e) => majSaison(i, { from_year: Number(e.target.value) || 0 }, false)}
                  onBlur={(e) => majSaison(i, { from_year: Number(e.target.value) || 0 }, true)}
                />
                <span className="text-xs text-muted-foreground" aria-hidden>–</span>
                <Input
                  type="number"
                  value={age.to_year ?? ""}
                  placeholder="…"
                  aria-label={tSettings("ageTo", { name: age.name })}
                  className={cn(BARE_INPUT, NO_SPIN, "w-16")}
                  onChange={(e) => majSaison(i, { to_year: e.target.value === "" ? null : Number(e.target.value) }, false)}
                  onBlur={(e) => majSaison(i, { to_year: e.target.value === "" ? null : Number(e.target.value) }, true)}
                />
                <button
                  type="button"
                  aria-label={tSettings("deleteAge", { name: age.name })}
                  onClick={() => onPersist({ ages: ages.filter((_, j) => j !== i) })}
                  className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs italic text-muted-foreground">{tSettings("noAgesHint")}</p>
        )}

        <AddRow
          disabled={!newAge.name.trim() || Number.isNaN(parseInt(newAge.from, 10))}
          addLabel={tSettings("addAge")}
          onAdd={ajouterSaison}
        >
          <Input
            value={newAge.name}
            placeholder={tSettings("ageNamePlaceholder")}
            aria-label={tSettings("ageNamePlaceholder")}
            className={cn(BARE_INPUT, "min-w-0 flex-1")}
            onChange={(e) => setNewAge((a) => ({ ...a, name: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); ajouterSaison(); }
            }}
          />
          <Input
            type="number"
            value={newAge.from}
            placeholder={tSettings("ageFromPlaceholder")}
            aria-label={tSettings("ageFromPlaceholder")}
            className={cn(BARE_INPUT, NO_SPIN, "w-24")}
            onChange={(e) => setNewAge((a) => ({ ...a, from: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); ajouterSaison(); }
            }}
          />
        </AddRow>
      </SettingsSection>

      {/* ── Les fêtes du calendrier ── */}
      {/* Des jours qui reviennent chaque année : la frise les rappelle à leur
          date, dans les mois qui ont déjà une entrée. */}
      <SettingsSection title={tSettings("timelineHolidays")} help={tSettings("timelineHolidaysHelp")}>
        {holidays.length > 0 ? (
          <ol className="space-y-2" aria-label={tSettings("timelineHolidays")}>
            {holidays.map((fete, i) => (
              <li key={i} className="flex h-11 items-center gap-2 rounded-lg border border-border-soft pl-2 pr-1.5">
                <Input
                  value={fete.name}
                  maxLength={HOLIDAY_NAME_MAX}
                  aria-label={tSettings("holidayName")}
                  className={cn(BARE_INPUT, "min-w-0 flex-1 font-medium")}
                  onChange={(e) => majFete(i, { name: e.target.value }, false)}
                  onBlur={(e) => majFete(i, { name: e.target.value }, true)}
                />
                <Input
                  type="number"
                  min={1}
                  value={fete.day ?? ""}
                  placeholder="…"
                  aria-label={tSettings("holidayDay", { name: fete.name })}
                  className={cn(BARE_INPUT, NO_SPIN, "w-12 text-right")}
                  onChange={(e) => majFete(i, { day: e.target.value === "" ? null : Number(e.target.value) }, false)}
                  onBlur={(e) => majFete(i, { day: jourDe(e.target.value, fete.month) }, true)}
                />
                <select
                  value={fete.month}
                  aria-label={tSettings("holidayMonth", { name: fete.name })}
                  className="h-8 w-32 rounded-md border border-border-soft bg-transparent px-2 text-sm"
                  onChange={(e) => {
                    const month = Number(e.target.value);
                    majFete(i, { month, day: fete.day === null ? null : Math.min(fete.day, daysInMonth(config, month)) }, true);
                  }}
                >
                  {config.month_names.map((nom, m) => (
                    <option key={m} value={m}>{nom}</option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={tSettings("deleteHoliday", { name: fete.name })}
                  onClick={() => onPersist({ holidays: holidays.filter((_, j) => j !== i) })}
                  className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs italic text-muted-foreground">{tSettings("noHolidaysHint")}</p>
        )}

        {nbMois > 0 && (
          <AddRow disabled={!newHoliday.name.trim()} addLabel={tSettings("addHoliday")} onAdd={ajouterFete}>
            <Input
              value={newHoliday.name}
              maxLength={HOLIDAY_NAME_MAX}
              placeholder={tSettings("holidayNamePlaceholder")}
              aria-label={tSettings("holidayNamePlaceholder")}
              className={cn(BARE_INPUT, "min-w-0 flex-1")}
              onChange={(e) => setNewHoliday((h) => ({ ...h, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); ajouterFete(); }
              }}
            />
            <Input
              type="number"
              min={1}
              value={newHoliday.day}
              placeholder={tSettings("holidayDayPlaceholder")}
              aria-label={tSettings("holidayDayPlaceholder")}
              className={cn(BARE_INPUT, NO_SPIN, "w-14")}
              onChange={(e) => setNewHoliday((h) => ({ ...h, day: e.target.value }))}
            />
            <select
              value={newHoliday.month}
              aria-label={tSettings("holidayMonthPlaceholder")}
              className="h-8 w-32 rounded-md border border-border-soft bg-transparent px-2 text-sm"
              onChange={(e) => setNewHoliday((h) => ({ ...h, month: Number(e.target.value) }))}
            >
              {config.month_names.map((nom, m) => (
                <option key={m} value={m}>{nom}</option>
              ))}
            </select>
          </AddRow>
        )}
      </SettingsSection>

      {/* ── Ce que montre la frise ── */}
      <SettingsSection title={tSettings("timelineFrieze")} help={tSettings("timelineFriezeHelp")}>
        <ToggleList>
          <ToggleItem
            title={tSettings("showJournals")}
            help={tSettings("showJournalsHelp")}
            checked={!!config.show_journals}
            onCheckedChange={(v) => onPersist({ show_journals: v })}
          />
          {/* Un salon en cours sans message depuis ce délai paraît « en
              sommeil » ; rien n'est modifié en base (voir effectiveRoomStatus). */}
          <ToggleItem
            title={tSettings("dormantDays")}
            help={tSettings("dormantDaysHelp")}
            control={
              <Input
                type="number"
                min={0}
                max={DORMANT_DAYS_MAX}
                value={config.dormant_days ?? DEFAULT_DORMANT_DAYS}
                aria-label={tSettings("dormantDays")}
                className="h-8 w-20 shrink-0 text-sm"
                onChange={(e) => onDraft({ dormant_days: clampDormantDays(e.target.value) })}
                onBlur={(e) => onPersist({ dormant_days: clampDormantDays(e.target.value) })}
              />
            }
          />
        </ToggleList>
      </SettingsSection>
    </div>
  );
}

/** La ligne d'ajout qui ferme une liste : ses champs, puis « + ». */
function AddRow({
  disabled,
  addLabel,
  onAdd,
  children,
}: {
  disabled: boolean;
  addLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-11 items-center gap-1 rounded-lg border border-dashed border-border-soft pl-2 pr-1.5">
      {children}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="size-8 shrink-0 p-0"
        disabled={disabled}
        aria-label={addLabel}
        onClick={onAdd}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

const HOLIDAY_NAME_MAX = 60;
const DORMANT_DAYS_MAX = 3650;

/** Un délai de mise en sommeil saisi : entier, de 0 (jamais) à dix ans. */
function clampDormantDays(value: string): number {
  const days = parseInt(value, 10);
  return Number.isNaN(days) ? 0 : Math.min(Math.max(days, 0), DORMANT_DAYS_MAX);
}
