"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";

import type { WorldTimelineAge, WorldTimelineConfig } from "@/types/worlds";
import {
  clampDaysPerMonth,
  daysInMonth,
  formatTimelineLabel,
  DEFAULT_DAYS_PER_MONTH,
  REAL_DAYS_PER_MONTH,
  REAL_MONTH_NAMES,
} from "@/lib/worldTimeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Les réglages d'une chronologie activée.
 *
 * L'écran listait des champs sans dire à quoi ils servaient : on remplissait
 * un « libellé d'année » et une « ère » sans voir ce qu'ils produisaient, et
 * rien n'expliquait que l'année courante est celle que les salons reçoivent
 * par défaut. L'aperçu en tête montre donc le résultat — la date telle
 * qu'elle s'affichera —, et chaque sous-option dit ce qu'elle y apporte.
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
  const [newMonthName, setNewMonthName] = React.useState("");
  const [newAge, setNewAge] = React.useState<{ name: string; from: string }>({ name: "", from: "" });
  const ages = config.ages ?? [];

  const apercu = formatTimelineLabel(config, {
    year: config.current_year,
    month: config.current_month,
    day: null,
  });
  const nbMois = config.month_names.length;
  // La période que la restriction imposerait : l'année, et le mois s'il y en a un.
  const periode = formatTimelineLabel(config, {
    year: config.current_year,
    month: config.current_month !== null && config.current_month < nbMois ? config.current_month : null,
    day: null,
  });
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

  function ajouterMois() {
    const nom = newMonthName.trim();
    if (!nom) return;
    onPersist({
      month_names: [...config.month_names, nom],
      days_per_month: [...(config.days_per_month ?? []), DEFAULT_DAYS_PER_MONTH],
    });
    setNewMonthName("");
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
    <>
      {/* ── Aperçu : ce que composent les trois réglages qui suivent ── */}
      <div className="ml-4 rounded-xl border border-border-soft bg-muted/20 p-3" data-testid="timeline-preview">
        <p className="text-xs text-muted-foreground">{tSettings("timelinePreviewLabel")}</p>
        <p className="mt-0.5 text-lg font-semibold leading-tight">{apercu}</p>
        <p className="mt-1 text-xs text-muted-foreground leading-snug">{tSettings("timelinePreviewHelp")}</p>
      </div>

      {/* ── 1. Comment une date s'écrit ── */}
      <SubOption title={tSettings("timelineFormat")} help={tSettings("timelineFormatHelp")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="timeline-year-label" className="text-xs">{t("yearLabel")}</Label>
            <Input
              id="timeline-year-label"
              value={config.year_label}
              placeholder={tSettings("yearPlaceholder")}
              className="h-9 text-sm"
              onChange={(e) => onDraft({ year_label: e.target.value })}
              onBlur={(e) => onPersist({ year_label: e.target.value || tSettings("yearPlaceholder") })}
            />
            <p className="text-[11px] text-muted-foreground">{tSettings("yearLabelHint")}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="timeline-era" className="text-xs">{t("eraSuffix")}</Label>
            <Input
              id="timeline-era"
              value={config.era_name ?? ""}
              placeholder={t("eraPlaceholder")}
              className="h-9 text-sm"
              onChange={(e) => onDraft({ era_name: e.target.value || null })}
              onBlur={(e) => onPersist({ era_name: e.target.value || null })}
            />
            <p className="text-[11px] text-muted-foreground">{tSettings("eraHint")}</p>
          </div>
        </div>
      </SubOption>

      {/* ── 2. Où en est le récit ── */}
      <SubOption title={tSettings("timelineNow")} help={tSettings("timelineNowHelp")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="timeline-current-year" className="text-xs">{t("currentYear")}</Label>
            <Input
              id="timeline-current-year"
              type="number"
              value={config.current_year}
              min={-99999}
              max={99999}
              className="h-9 text-sm"
              onChange={(e) => onDraft({ current_year: Number(e.target.value) || 1 })}
              onBlur={(e) => onPersist({ current_year: Number(e.target.value) || 1 })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="timeline-current-month" className="text-xs">{tSettings("currentMonth")}</Label>
            {/* Sans mois défini, le champ reste là mais se tait : il
                disparaissait, et la rangée se retrouvait bancale. */}
            <select
              id="timeline-current-month"
              value={config.current_month ?? ""}
              disabled={nbMois === 0}
              className="h-9 w-full rounded-lg border border-border bg-transparent px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(e) => onPersist({ current_month: e.target.value === "" ? null : Number(e.target.value) })}
            >
              <option value="">{nbMois === 0 ? tSettings("noMonths") : "—"}</option>
              {config.month_names.map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* La période en cours : là où les salons peuvent se situer. */}
        <label className="flex items-start justify-between gap-4 border-t border-border-soft pt-3">
          <span className="space-y-0.5">
            <span className="block text-sm">{tSettings("restrictToCurrent")}</span>
            <span className="block text-xs text-muted-foreground leading-snug">
              {tSettings("restrictToCurrentHelp", { period: periode })}
            </span>
          </span>
          <Switch
            checked={!!config.restrict_to_current}
            onCheckedChange={(v) => onPersist({ restrict_to_current: v })}
            aria-label={tSettings("restrictToCurrent")}
            className="mt-0.5 shrink-0"
          />
        </label>

        {/* Dater chaque salon dès sa création. */}
        <label className="flex items-start justify-between gap-4 border-t border-border-soft pt-3">
          <span className="space-y-0.5">
            <span className="block text-sm">{tSettings("requireDate")}</span>
            <span className="block text-xs text-muted-foreground leading-snug">{tSettings("requireDateHelp")}</span>
          </span>
          <Switch
            checked={!!config.require_date}
            onCheckedChange={(v) => onPersist({ require_date: v })}
            aria-label={tSettings("requireDate")}
            className="mt-0.5 shrink-0"
          />
        </label>
      </SubOption>

      {/* ── 3. Le calendrier ── */}
      {/* Chaque mois porte sa durée (elle borne le choix d'un jour, et le
          calendrier du bloc « Raccourcis chronologie » de l'accueil). Les deux
          tableaux `month_names` / `days_per_month` restent parallèles : tout
          ajout, retrait ou préréglage touche les deux à la fois. */}
      <SubOption
        title={t("calendarMonths")}
        help={tSettings("timelineCalendarHelp")}
        action={
          <button
            type="button"
            onClick={() => onPersist({ month_names: REAL_MONTH_NAMES, days_per_month: REAL_DAYS_PER_MONTH })}
            className="shrink-0 whitespace-nowrap text-[11px] text-primary hover:underline"
          >
            {tSettings("useRealMonths")}
          </button>
        }
      >
        {nbMois > 0 ? (
          <ol className="space-y-1">
            {config.month_names.map((m, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <Input
                  value={m}
                  aria-label={t("monthNamePlaceholder")}
                  className="h-8 flex-1 text-sm"
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
                <div className="flex shrink-0 items-center gap-1">
                  <Input
                    type="number"
                    aria-label={tSettings("daysInMonth", { month: m || `${i + 1}` })}
                    value={config.days_per_month?.[i] ?? DEFAULT_DAYS_PER_MONTH}
                    min={1}
                    max={999}
                    className="h-8 w-16 text-sm"
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
                  <span className="w-6 text-[11px] text-muted-foreground">{tSettings("daysUnit")}</span>
                </div>
                <button
                  type="button"
                  aria-label={tSettings("deleteMonth", { month: m || `${i + 1}` })}
                  onClick={() => retirerMois(i)}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs italic text-muted-foreground">{tSettings("noMonthsHint")}</p>
        )}

        {/* La saisie ferme la liste, comme celle des tags. */}
        <div className="flex items-center gap-1 rounded-lg border border-border-soft p-1">
          <Input
            value={newMonthName}
            placeholder={t("monthNamePlaceholder")}
            className="h-8 flex-1 border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-0"
            onChange={(e) => setNewMonthName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newMonthName.trim()) {
                e.preventDefault();
                ajouterMois();
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            disabled={!newMonthName.trim()}
            aria-label={t("addMonthName")}
            onClick={ajouterMois}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {nbMois > 0 && (
          <p className="text-right text-[11px] tabular-nums text-muted-foreground" data-testid="timeline-year-length">
            {tSettings("yearLength", { months: nbMois, days: joursParAn })}
          </p>
        )}
      </SubOption>

      {/* ── 4. Les saisons ── */}
      {/* Des âges nommés : ils remplacent, sur la frise, les tranches de cinq
          ans, et ouvrent leurs années d'un bandeau. Sans année de fin, une
          saison court jusqu'à la suivante. */}
      <SubOption title={tSettings("timelineAges")} help={tSettings("timelineAgesHelp")}>
        {ages.length > 0 ? (
          <ol className="space-y-1" aria-label={tSettings("timelineAges")}>
            {ages.map((age, i) => (
              <li key={i} className="flex items-center gap-2">
                <Input
                  value={age.name}
                  aria-label={tSettings("ageName")}
                  className="h-8 min-w-0 flex-1 text-sm"
                  onChange={(e) => majSaison(i, { name: e.target.value }, false)}
                  onBlur={(e) => majSaison(i, { name: e.target.value }, true)}
                />
                <Input
                  type="number"
                  value={age.from_year}
                  aria-label={tSettings("ageFrom", { name: age.name })}
                  className="h-8 w-20 text-sm"
                  onChange={(e) => majSaison(i, { from_year: Number(e.target.value) || 0 }, false)}
                  onBlur={(e) => majSaison(i, { from_year: Number(e.target.value) || 0 }, true)}
                />
                <span className="text-xs text-muted-foreground" aria-hidden>–</span>
                <Input
                  type="number"
                  value={age.to_year ?? ""}
                  placeholder="…"
                  aria-label={tSettings("ageTo", { name: age.name })}
                  className="h-8 w-20 text-sm"
                  onChange={(e) => majSaison(i, { to_year: e.target.value === "" ? null : Number(e.target.value) }, false)}
                  onBlur={(e) => majSaison(i, { to_year: e.target.value === "" ? null : Number(e.target.value) }, true)}
                />
                <button
                  type="button"
                  aria-label={tSettings("deleteAge", { name: age.name })}
                  onClick={() => onPersist({ ages: ages.filter((_, j) => j !== i) })}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs italic text-muted-foreground">{tSettings("noAgesHint")}</p>
        )}

        <div className="flex items-center gap-1 rounded-lg border border-border-soft p-1">
          <Input
            value={newAge.name}
            placeholder={tSettings("ageNamePlaceholder")}
            aria-label={tSettings("ageNamePlaceholder")}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-0"
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
            className="h-8 w-24 border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-0"
            onChange={(e) => setNewAge((a) => ({ ...a, from: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); ajouterSaison(); }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            disabled={!newAge.name.trim() || Number.isNaN(parseInt(newAge.from, 10))}
            aria-label={tSettings("addAge")}
            onClick={ajouterSaison}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </SubOption>

      {/* ── 5. Ce que montre la frise ── */}
      <SubOption title={tSettings("timelineFrieze")} help={tSettings("timelineFriezeHelp")}>
        <label className="flex items-start justify-between gap-4">
          <span className="space-y-0.5">
            <span className="block text-sm">{tSettings("showJournals")}</span>
            <span className="block text-xs text-muted-foreground leading-snug">{tSettings("showJournalsHelp")}</span>
          </span>
          <Switch
            checked={!!config.show_journals}
            onCheckedChange={(v) => onPersist({ show_journals: v })}
            aria-label={tSettings("showJournals")}
            className="mt-0.5 shrink-0"
          />
        </label>
      </SubOption>
    </>
  );
}

/** Une sous-option en retrait, au dessin de celles de la fiche par défaut. */
function SubOption({
  title,
  help,
  action,
  children,
}: {
  title: string;
  help: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="ml-4 space-y-3 rounded-xl border border-border-soft bg-muted/20 p-3" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground leading-snug">{help}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
