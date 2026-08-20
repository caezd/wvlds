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

/** Nombre de jours du mois d'index `month` (même index que `month_names`). */
export function daysInMonth(config: WorldTimelineConfig, month: number): number {
  return config.days_per_month?.[month] ?? DEFAULT_DAYS_PER_MONTH;
}

/** Préréglage « mois réels » du calendrier — noms et longueurs grégoriens,
 *  toujours utilisés en paire (voir le bouton « Utiliser les mois réels »,
 *  WorldSettingsView.tsx). */
export const REAL_MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
export const REAL_DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
