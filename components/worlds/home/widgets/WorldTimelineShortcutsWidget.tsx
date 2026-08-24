"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { daysInMonth, formatTimelineLabel } from "@/lib/worldTimeline";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

type TimelineRoom = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  timeline_date?: WorldTimelineDate | null;
};

type DatedRoom = TimelineRoom & { timeline_date: WorldTimelineDate };

type Cursor = { year: number; month: number };

function compareTimelineDate(a: WorldTimelineDate, b: WorldTimelineDate): number {
  if (a.year !== b.year) return a.year - b.year;
  const ma = a.month ?? -1;
  const mb = b.month ?? -1;
  if (ma !== mb) return ma - mb;
  return (a.day ?? 0) - (b.day ?? 0);
}

/**
 * Choisit le mois de départ : le premier mois (année + mois) qui contient
 * une entrée à venir ou en cours par rapport à `current` (le « aujourd'hui »
 * fictif du monde, voir WorldTimelineConfig) ; à défaut, le mois de la
 * dernière entrée passée ; à défaut, le mois courant du monde. `dated` est
 * déjà trié chronologiquement.
 */
function pickStartCursor(dated: DatedRoom[], config: WorldTimelineConfig): Cursor {
  const currentMonth = config.current_month ?? 0;
  const withMonth = dated.filter((r) => r.timeline_date.month !== null);
  if (withMonth.length === 0) return { year: config.current_year, month: currentMonth };
  const upcoming = withMonth.find(
    (r) =>
      r.timeline_date.year > config.current_year ||
      (r.timeline_date.year === config.current_year && r.timeline_date.month! >= (config.current_month ?? -1)),
  );
  const target = upcoming ?? withMonth[withMonth.length - 1];
  return { year: target.timeline_date.year, month: target.timeline_date.month! };
}

/**
 * Décale `cursor` de `delta` mois, en enchaînant les années — le calendrier
 * du monde n'a qu'une seule liste de noms de mois (`month_names`), partagée
 * par toutes les années, donc chaque année compte le même nombre de mois.
 */
function shiftMonth(cursor: Cursor, delta: number, monthCount: number): Cursor {
  const linear = cursor.year * monthCount + cursor.month + delta;
  const year = Math.floor(linear / monthCount);
  const month = ((linear % monthCount) + monthCount) % monthCount;
  return { year, month };
}

/**
 * Aperçu compact de la Chronologie du monde (voir WorldTimeline.tsx, le
 * panneau complet accessible via `?view=timeline`) — un petit calendrier
 * pour parcourir les salons déjà situés dans le temps fictif du monde :
 * sélecteur de mois/année en tête (flèches précédent/suivant), la grille
 * des jours du mois en dessous (pastille sur les jours qui portent une
 * entrée), et la liste du jour sélectionné tout en bas.
 *
 * Le calendrier du monde n'a pas de notion de semaine — seulement une
 * liste de mois nommés et un nombre de jours par mois réglable (voir
 * `days_per_month` dans les réglages de la Chronologie) — donc pas de
 * grille S/M/T/W/T/F/S comme un vrai calendrier, juste une bande de jours.
 * Sans mois défini du tout (`month_names` vide), aucune grille n'a de sens :
 * on retombe alors sur une simple liste chronologique.
 *
 * Données déjà chargées par WorldHome.tsx (mêmes `initialRooms` et
 * `timeline_config` que le panneau complet et le composer) : ce widget ne
 * fait aucune requête, contrairement aux autres widgets « raccourcis »
 * (wiki, personas) qui chargent leurs propres données en temps réel.
 */
export function WorldTimelineShortcutsWidget({
  worldId,
  rooms,
  config,
  limit = 6,
}: {
  worldId: string;
  rooms: TimelineRoom[];
  /** `undefined` si la Chronologie n'est pas activée pour ce monde. */
  config: WorldTimelineConfig | undefined;
  /** Nombre d'entrées listées — réglage du widget (voir WORLD_HOME_WIDGET_OPTIONS). */
  limit?: number;
}) {
  const t = useTranslations("worlds");

  const dated = React.useMemo(
    () =>
      rooms
        .filter((r): r is DatedRoom => !!r.timeline_date)
        .sort((a, b) => compareTimelineDate(a.timeline_date, b.timeline_date)),
    [rooms],
  );

  const monthCount = config?.month_names.length ?? 0;
  const hasCalendar = !!config && monthCount > 0;

  const [cursor, setCursor] = React.useState<Cursor | null>(
    hasCalendar && config ? pickStartCursor(dated, config) : null,
  );
  const activeCursor = cursor ?? (hasCalendar && config ? pickStartCursor(dated, config) : null);

  const monthEntries = activeCursor
    ? dated.filter((r) => r.timeline_date.year === activeCursor.year && r.timeline_date.month === activeCursor.month)
    : [];
  const entryDays = new Set(monthEntries.filter((r) => r.timeline_date.day !== null).map((r) => r.timeline_date.day!));
  const dayCount = config && activeCursor ? daysInMonth(config, activeCursor.month) : 0;
  const dayList = hasCalendar ? Array.from({ length: dayCount }, (_, i) => i + 1) : [];

  const [selectedDay, setSelectedDay] = React.useState<number | null>(() => {
    const firstWithEntry = dayList.find((d) => entryDays.has(d));
    return firstWithEntry ?? null;
  });
  const day = hasCalendar ? selectedDay : null;

  function goToMonth(delta: number) {
    if (!activeCursor || !config) return;
    const next = shiftMonth(activeCursor, delta, monthCount);
    setCursor(next);
    // Réamorce la sélection sur le premier jour à contenu du nouveau mois
    // (même logique qu'au montage) — sinon la bande affiche des pastilles
    // sans qu'aucune entrée ne soit listée en dessous. `dayList` (state
    // React, pas encore recalculé) correspond toujours à l'ANCIEN mois
    // quitté : si le nouveau mois compte plus de jours, une entrée située
    // au-delà de l'ancienne longueur ne pouvait jamais être trouvée.
    const nextDayList = Array.from({ length: daysInMonth(config, next.month) }, (_, i) => i + 1);
    const nextMonthEntries = dated.filter((r) => r.timeline_date.year === next.year && r.timeline_date.month === next.month);
    const nextEntryDays = new Set(nextMonthEntries.filter((r) => r.timeline_date.day !== null).map((r) => r.timeline_date.day!));
    setSelectedDay(nextDayList.find((d) => nextEntryDays.has(d)) ?? null);
  }

  if (!config || dated.length === 0) return null;

  // Sans calendrier (aucun mois défini pour ce monde) : simple liste
  // chronologique de repli, comme avant l'introduction du calendrier.
  const visible = !hasCalendar
    ? dated
    : day !== null
      ? monthEntries.filter((r) => r.timeline_date.day === day)
      : monthEntries.filter((r) => r.timeline_date.day === null);
  const shown = visible.slice(0, limit);

  return (
    <div className="rounded-lg border p-2">
      {hasCalendar && activeCursor && (
        <div className="px-1 pb-2 pt-1">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label={t("home.timelineShortcuts.previousMonth")}
              onClick={() => goToMonth(-1)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hoverCard hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="truncate text-xs font-semibold text-foreground/90">
              {formatTimelineLabel(config, { year: activeCursor.year, month: activeCursor.month, day: null })}
            </p>
            <button
              type="button"
              aria-label={t("home.timelineShortcuts.nextMonth")}
              onClick={() => goToMonth(1)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hoverCard hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {dayList.map((d) => {
              const hasEntry = entryDays.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={day === d}
                  aria-label={t("home.timelineShortcuts.selectDay", {
                    day: formatTimelineLabel(config, { year: activeCursor.year, month: activeCursor.month, day: d }),
                  })}
                  onClick={() => setSelectedDay(d)}
                  className={cn(
                    "flex shrink-0 flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                    day === d
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-hoverCard hover:text-foreground",
                  )}
                >
                  <span className="font-medium tabular-nums">{d}</span>
                  <span
                    className={cn(
                      "h-1 w-1 rounded-full",
                      !hasEntry ? "bg-transparent" : day === d ? "bg-primary-foreground" : "bg-primary/70",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {shown.length > 0 ? (
        <ul>
          {shown.map((room) => {
            const label = room.title ?? room.name ?? "Conversation";
            return (
              <li key={room.id}>
                <Link
                  href={`/c/${room.id}`}
                  className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-hoverCard"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card-400 text-muted-foreground overflow-hidden">
                    {room.icon_url ? (
                      <Image src={room.icon_url} alt="" width={32} height={32} className="h-full w-full object-cover" />
                    ) : (
                      <CalendarDays className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground/90">{label}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {formatTimelineLabel(config, room.timeline_date)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        hasCalendar && (
          <p className="px-3 py-2.5 text-xs text-muted-foreground/70">{t("home.timelineShortcuts.noEntries")}</p>
        )
      )}

      <Link
        href={`/w/${worldId}?view=timeline`}
        className="mt-1 block px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {t("home.timelineShortcuts.viewAll")}
      </Link>
    </div>
  );
}
