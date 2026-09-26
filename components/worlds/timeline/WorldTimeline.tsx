"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { RPC } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { formatTimelineLabel } from "@/lib/worldTimeline";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

type TimelineRoom = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  timeline_date: WorldTimelineDate | null;
};

type YearSection = { year: number; rooms: TimelineRoom[] };

/** Qui a ouvert un salon : le membre du premier message, et le persona sous
 *  lequel il l'a écrit, dans la couleur de son groupe (migration 192). */
type Opener = { name: string; persona: string | null; personaColor: string | null };
type OpenerRow = { chat_id: string; author_name: string | null; persona_name: string | null; group_color: string | null };

/** Années regroupées par tranches de RANGE_SPAN pour les pastilles de tête. */
const RANGE_SPAN = 5;

/**
 * La chronologie d'un monde, en frise verticale : à gauche les années en très
 * grands chiffres, au centre un fil, et pour chaque salon un anneau sur le
 * fil, sa date puis son titre. Un filet sépare les
 * années, un filet chaque mois (son nom posé dessus, en capitales) ; la date
 * actuelle du monde barre la frise d'un trait rouge plein, à son mois, et la
 * frise s'ouvre sur son année. Au-delà de RANGE_SPAN années, des pastilles en tête
 * mènent à chaque tranche et suivent le défilement.
 */
export function WorldTimeline({
  worldId,
  rooms,
  config,
}: {
  worldId: string;
  rooms: TimelineRoom[];
  config: WorldTimelineConfig;
}) {
  const t = useTranslations("worlds");
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openers, setOpeners] = useState<ReadonlyMap<string, Opener>>(new Map());

  // Les auteurs se chargent avec la frise, sans la retenir : les titres
  // paraissent d'abord, « par … » les rejoint.
  useEffect(() => {
    let cancelled = false;
    void createClient()
      .rpc(RPC.GET_CHATROOM_OPENERS, { p_world_id: worldId })
      .then(({ data, error }: { data: OpenerRow[] | null; error: unknown }) => {
        if (cancelled) return;
        if (error) {
          console.error("[WorldTimeline] auteurs des salons", error);
          return;
        }
        const map = new Map<string, Opener>();
        for (const row of data ?? []) {
          if (row.author_name) {
            map.set(row.chat_id, { name: row.author_name, persona: row.persona_name, personaColor: row.group_color });
          }
        }
        setOpeners(map);
      });
    return () => { cancelled = true; };
  }, [worldId]);
  const navRef = useRef<HTMLElement>(null);

  // Une section par année, ses salons dans l'ordre du récit. L'année actuelle
  // du monde a toujours la sienne, pour porter son repère.
  const sections: YearSection[] = useMemo(() => {
    const dated = rooms.filter((r) => r.timeline_date !== null);
    if (dated.length === 0) return [];
    const byYear = new Map<number, TimelineRoom[]>();
    for (const room of dated) {
      const y = room.timeline_date!.year;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(room);
    }
    if (!byYear.has(config.current_year)) byYear.set(config.current_year, []);
    return [...byYear.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, list]) => ({
        year,
        rooms: [...list].sort((a, b) =>
          (a.timeline_date!.month ?? -1) - (b.timeline_date!.month ?? -1) ||
          (a.timeline_date!.day ?? 0) - (b.timeline_date!.day ?? 0),
        ),
      }));
  }, [rooms, config.current_year]);

  const firstYear = sections[0]?.year ?? 0;
  const rangeOf = (year: number) => Math.floor((year - firstYear) / RANGE_SPAN);
  const ranges = useMemo(() => {
    const seen = new Map<number, number>(); // tranche → première année présente
    for (const s of sections) {
      const r = Math.floor((s.year - firstYear) / RANGE_SPAN);
      if (!seen.has(r)) seen.set(r, s.year);
    }
    return [...seen.entries()].map(([index, year]) => ({
      index,
      year,
      label: `${firstYear + index * RANGE_SPAN} – ${firstYear + index * RANGE_SPAN + RANGE_SPAN - 1}`,
    }));
  }, [sections, firstYear]);
  const [activeRange, setActiveRange] = useState(() => rangeOf(config.current_year));

  function sectionEl(year: number): HTMLElement | null {
    return scrollRef.current?.querySelector<HTMLElement>(`[data-year="${year}"]`) ?? null;
  }

  function scrollToYear(year: number, smooth: boolean) {
    const el = scrollRef.current;
    const section = sectionEl(year);
    if (!el || !section) return;
    const top = section.offsetTop - (navRef.current?.offsetHeight ?? 0);
    if (typeof el.scrollTo === "function") el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    else el.scrollTop = top;
  }

  // S'ouvrir sur l'année actuelle du monde.
  useEffect(() => {
    scrollToYear(config.current_year, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- à l'ouverture seulement
  }, []);

  // Les pastilles suivent le défilement : la tranche de la dernière année
  // passée sous elles.
  function onScroll() {
    const el = scrollRef.current;
    if (!el || ranges.length < 2) return;
    const seuil = el.getBoundingClientRect().top + (navRef.current?.offsetHeight ?? 0) + 8;
    let current = sections[0]?.year ?? 0;
    for (const s of sections) {
      const node = sectionEl(s.year);
      if (node && node.getBoundingClientRect().top <= seuil) current = s.year;
    }
    setActiveRange(rangeOf(current));
  }

  const nowLabel = t("settings.timelinePreviewLabel");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorldPanelHeader
        icon={<Clock className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("nav.timeline")}
      />

      {sections.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">{t("timelineEmpty")}</p>
      ) : (
        <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 overflow-y-auto" data-testid="timeline-scroll">
          {ranges.length > 1 && (
            <nav
              ref={navRef}
              aria-label={t("timelineRanges")}
              className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-background/90 px-5 py-3 backdrop-blur"
            >
              {ranges.map((r) => (
                <button
                  key={r.index}
                  type="button"
                  aria-current={r.index === activeRange ? "true" : undefined}
                  onClick={() => { setActiveRange(r.index); scrollToYear(r.year, true); }}
                  className={cn(
                    "h-7 shrink-0 rounded-full px-4 text-xs font-medium tabular-nums transition-colors",
                    r.index === activeRange
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </nav>
          )}

          <ol className="px-5 pb-6">
            {sections.map((section) => (
              <YearBlock
                key={section.year}
                section={section}
                config={config}
                nowLabel={nowLabel}
                openers={openers}
                onOpen={(id) => router.push(`/c/${id}`)}
              />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// Le rouge de repère : l'accent du thème sombre ; en clair, où l'accent est
// presque blanc, un rouge franc.
const RED_BG = "bg-red-600 dark:bg-accent";

function YearBlock({
  section,
  config,
  nowLabel,
  openers,
  onOpen,
}: {
  section: YearSection;
  config: WorldTimelineConfig;
  nowLabel: string;
  openers: ReadonlyMap<string, Opener>;
  onOpen: (id: string) => void;
}) {
  const isNow = section.year === config.current_year;
  // La date actuelle du monde barre l'année d'un trait rouge, à son mois.
  const nowMonth = config.current_month;
  let insertAt = -1;
  if (isNow) {
    const after = nowMonth === null
      ? 0
      : section.rooms.findIndex((r) => (r.timeline_date!.month ?? -1) > nowMonth);
    insertAt = after === -1 ? section.rooms.length : after;
  }
  const nowText = `${nowLabel} : ${formatTimelineLabel(config, { year: config.current_year, month: nowMonth, day: null })}`;

  // Un filet ouvre chaque nouveau mois (sauf le premier de l'année).
  const entries: ReactNode[] = section.rooms.map((room, i) => (
    <EntryRow
      key={room.id}
      room={room}
      config={config}
      opener={openers.get(room.id) ?? null}
      newMonth={i > 0 && section.rooms[i - 1].timeline_date!.month !== room.timeline_date!.month}
      onClick={() => onOpen(room.id)}
    />
  ));
  if (insertAt >= 0) {
    entries.splice(insertAt, 0, (
      <li key="now" className="relative h-2" data-testid="timeline-now" title={nowText}>
        {/* Un trait plein, sans texte, du fil jusqu'au bord — la colonne des
            années reste libre ; un carré rouge sur le fil. */}
        <span
          className={cn("absolute -left-7 right-0 top-1/2 h-0.5 -translate-y-1/2", RED_BG)}
          aria-hidden
        />
        <span className={cn("absolute -left-[32.5px] top-1/2 size-2.5 -translate-y-1/2", RED_BG)} aria-hidden />
        <span className="sr-only">{nowText}</span>
      </li>
    ));
  }

  const caption = `${config.year_label}${config.era_name ? ` ${config.era_name}` : ""}`;

  return (
    <li
      data-year={section.year}
      className="grid grid-cols-[6rem_1fr] border-t border-border first:border-t-0 sm:grid-cols-[9rem_1fr]"
    >
      {/* L'année en très grands chiffres, sa légende en exposant. */}
      <h3 className="flex items-start gap-1 overflow-hidden pt-4 pb-4 pr-3">
        <span className="text-4xl font-semibold leading-[0.85] tracking-tighter tabular-nums sm:text-6xl">
          {section.year}
        </span>
        <span className="text-[11px] font-medium leading-none text-muted-foreground">{caption}</span>
      </h3>
      <div className="relative py-5 pl-7">
        {/* Le fil : d'une section à l'autre, il ne s'interrompt pas. */}
        <span className="absolute inset-y-0 left-0 w-px bg-border" aria-hidden />
        <ul className="space-y-4">{entries}</ul>
      </div>
    </li>
  );
}

/** « par Tess (@Poumon) », ou « par @Poumon » sans persona — la phrase
 *  lue par les lecteurs d'écran, la même qu'à l'écran. */
function openerText(opener: Opener, by: (name: string) => string): string {
  return opener.persona ? `${by(opener.persona)} (@${opener.name})` : by(`@${opener.name}`);
}

function EntryRow({
  room,
  config,
  opener,
  newMonth,
  onClick,
}: {
  room: TimelineRoom;
  config: WorldTimelineConfig;
  opener: Opener | null;
  newMonth: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("worlds");
  const label = room.title ?? room.name ?? t("timelineUntitled");
  const date = room.timeline_date!;
  const monthName = date.month !== null ? (config.month_names[date.month] ?? null) : null;
  // « 19 Février » ; rien quand la date s'arrête à l'année.
  const short = [date.day, monthName].filter((v) => v !== null && v !== undefined).join(" ");
  return (
    <li className={cn("group/entry relative", newMonth && "pt-4")} data-new-month={newMonth || undefined}>
      {/* Le filet d'un nouveau mois, en pointillés, du fil jusqu'au bord, à
          mi-chemin du salon précédent ; le nom du mois posé dessus, en petites
          capitales, dans l'alignement des titres. */}
      {newMonth && (
        <>
          <span className="absolute -left-7 right-0 top-0 border-t border-dashed border-border" aria-hidden />
          {monthName && (
            <span
              className="absolute left-0 top-0 -translate-x-2 -translate-y-1/2 whitespace-nowrap bg-background px-2 text-[10px] font-medium uppercase leading-none tracking-wider text-muted-foreground"
              data-testid="timeline-month-label"
              aria-hidden
            >
              {monthName}
            </span>
          )}
        </>
      )}
      {/* Un anneau creux sur le fil, centré sur la première ligne — la date,
          ou le titre quand il n'y en a pas — et qui fonce au survol. */}
      <span
        className={cn(
          "absolute -left-[33.5px] size-3 rounded-full border-[1.5px] border-border bg-background transition-colors group-hover/entry:border-foreground",
          short ? (newMonth ? "top-[18px]" : "top-0.5") : (newMonth ? "top-5" : "top-1"),
        )}
        data-testid="timeline-ring"
        aria-hidden
      />
      <button
        type="button"
        onClick={onClick}
        aria-label={[
          label,
          opener && openerText(opener, (name) => t("timelineByName", { name })),
          formatTimelineLabel(config, date),
        ]
          .filter(Boolean)
          .join(", ")}
        className="flex max-w-full flex-col items-start rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* La date, au-dessus du titre, sur une ligne de 16px : l'anneau
            se centre dessus. */}
        {short && (
          <span className="text-xs leading-4 tabular-nums text-muted-foreground" data-testid="timeline-date" aria-hidden>
            {short}
          </span>
        )}
        {/* Au survol, la ligne s’éclaircit seulement (titre atténué au repos) : pas de fond. */}
        <span className="min-w-0 break-words">
          <span className="text-sm font-medium text-foreground/75 transition-colors group-hover/entry:text-foreground">
            {label}
          </span>
          {/* « par Persona (@pseudo) » : le persona dans la couleur de son
              groupe, le pseudo du joueur entre parenthèses ; « par @pseudo »
              quand le salon n'a pas encore de message. */}
          {opener && (
            <span className="ml-1.5 text-xs text-muted-foreground" data-testid="timeline-opener" aria-hidden>
              {t.rich("timelineBy", {
                name: opener.persona ?? `@${opener.name}`,
                author: (chunks) => (
                  <span
                    className={cn("font-medium", !(opener.persona && opener.personaColor) && "text-foreground/75")}
                    style={opener.persona && opener.personaColor ? { color: opener.personaColor } : undefined}
                  >
                    {chunks}
                  </span>
                ),
              })}
              {opener.persona && ` (@${opener.name})`}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
