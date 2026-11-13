import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

/**
 * Formate une date fictive de chronologie en une étiquette d'une ligne
 * (ex. « 3 Septembre, An 1327 ») — partagé entre le composer (choix de
 * date d'un salon) et les aperçus de la chronologie sur la page d'accueil.
 */
export function formatTimelineLabel(config: WorldTimelineConfig, date: WorldTimelineDate): string {
  const y = `${config.year_label} ${date.year}${config.era_name ? ` ${config.era_name}` : ""}`;
  const m = date.month !== null ? config.month_names[date.month] : null;
  const d = date.day !== null ? `${date.day} ` : "";
  return m ? `${d}${m}, ${y}` : y;
}

/** Repli pour un mois sans longueur propre enregistrée (`days_per_month`
 *  absent, ou index manquant — ex. un mois ajouté avant ce réglage). */
export const DEFAULT_DAYS_PER_MONTH = 30;
export const MIN_DAYS_PER_MONTH = 1;
export const MAX_DAYS_PER_MONTH = 999;

/**
 * Entier borné à [MIN_DAYS_PER_MONTH, MAX_DAYS_PER_MONTH] — les attributs
 * HTML `min`/`max` d'un `<input type="number">` n'empêchent pas de saisir
 * une valeur hors bornes (ou décimale) au clavier ; sans ce garde-fou une
 * valeur aberrante (0, négative, ou un très grand nombre) survivait jusqu'au
 * widget de calendrier, qui construit un bouton par jour du mois
 * (`Array.from({ length })`) — de quoi geler la page.
 */
export function clampDaysPerMonth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DAYS_PER_MONTH;
  return Math.min(MAX_DAYS_PER_MONTH, Math.max(MIN_DAYS_PER_MONTH, Math.round(value)));
}

/** Nombre de jours du mois d'index `month` (même index que `month_names`) —
 *  toujours bornée, même si la valeur enregistrée en base ne l'était pas
 *  encore (voir clampDaysPerMonth). */
export function daysInMonth(config: WorldTimelineConfig, month: number): number {
  return clampDaysPerMonth(config.days_per_month?.[month] ?? DEFAULT_DAYS_PER_MONTH);
}

/** Préréglage « mois réels » du calendrier — noms et longueurs grégoriens,
 *  toujours utilisés en paire (voir le bouton « Utiliser les mois réels »,
 *  WorldSettingsView.tsx). */
export const REAL_MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
export const REAL_DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Compare deux dates de chronologie, à la finesse que TOUTES deux ont.
 *
 * « L'an 1200 » et « le 3 mars 1200 » sont la même époque : une date sans
 * mois parle de toute l'année, et se compare donc à l'année seule. C'est ce
 * qui permet de dire qu'un lieu fondé « en 1200 » existe bien « le 3 mars
 * 1200 » — sans exiger de l'auteur qu'il connaisse le jour de la fondation.
 */
export function compareTimelineDates(a: WorldTimelineDate, b: WorldTimelineDate): -1 | 0 | 1 {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month === null || b.month === null) return 0;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day === null || b.day === null) return 0;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

/**
 * La date tombe-t-elle entre les deux bornes ? Une borne absente ne borne
 * rien : « de toujours à toujours » est le cas d'un lieu sans dates.
 */
export function isWithinTimeline(
  date: WorldTimelineDate,
  from: WorldTimelineDate | null | undefined,
  until: WorldTimelineDate | null | undefined,
): boolean {
  if (from && compareTimelineDates(date, from) < 0) return false;
  if (until && compareTimelineDates(date, until) > 0) return false;
  return true;
}

/**
 * Ce que la « période en cours » fige d'une date de salon.
 *
 * Restreinte, la chronologie ne laisse situer un salon que dans l'année
 * courante — et dans le mois courant, si le récit en a un. Sans restriction,
 * rien n'est figé.
 */
export function currentPeriodLock(config: WorldTimelineConfig): { year: number | null; month: number | null } {
  if (!config.restrict_to_current) return { year: null, month: null };
  const month =
    config.current_month !== null && config.current_month < config.month_names.length ? config.current_month : null;
  return { year: config.current_year, month };
}

/**
 * Ramène une date dans ce que permet le monde : la période en cours quand
 * elle est imposée, un mois qui existe, un jour qui tient dans son mois.
 */
export function clampTimelineDate(config: WorldTimelineConfig, date: WorldTimelineDate): WorldTimelineDate {
  const lock = currentPeriodLock(config);
  const year = lock.year ?? date.year;
  let month = lock.month ?? date.month;
  if (month !== null && (month < 0 || month >= config.month_names.length)) month = null;
  let day = month === null ? null : date.day;
  if (day !== null) day = Math.min(Math.max(1, Math.trunc(day)), daysInMonth(config, month!));
  return { year, month, day };
}
