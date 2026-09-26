"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Clock, X, MessageSquare } from "lucide-react";
import { WorldPanelHeader } from "@/components/worlds/WorldPanelHeader";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

type TimelineRoom = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  timeline_date: WorldTimelineDate | null;
};

type Grouped = Map<number, Map<number | null, TimelineRoom[]>>;

export function WorldTimeline({
  worldId: _worldId,
  rooms,
  config,
  onClose,
}: {
  worldId: string;
  rooms: TimelineRoom[];
  config: WorldTimelineConfig;
  onClose: () => void;
}) {
  const t = useTranslations("worlds");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const { dated } = useMemo(() => {
    const d: TimelineRoom[] = [];
    const u: TimelineRoom[] = [];
    for (const r of rooms) {
      if (r.timeline_date !== null) d.push(r);
      else u.push(r);
    }
    return { dated: d, undated: u };
  }, [rooms]);

  // Groupe par année puis par mois (null = sans mois précisé)
  const grouped: Grouped = useMemo(() => {
    const map: Grouped = new Map();
    const sorted = [...dated].sort((a, b) => {
      const ya = a.timeline_date!.year;
      const yb = b.timeline_date!.year;
      if (ya !== yb) return ya - yb;
      const ma = a.timeline_date!.month ?? -1;
      const mb = b.timeline_date!.month ?? -1;
      if (ma !== mb) return ma - mb;
      const da = a.timeline_date!.day ?? 0;
      const db = b.timeline_date!.day ?? 0;
      return da - db;
    });
    for (const room of sorted) {
      const { year, month } = room.timeline_date!;
      if (!map.has(year)) map.set(year, new Map());
      const monthMap = map.get(year)!;
      if (!monthMap.has(month)) monthMap.set(month, []);
      monthMap.get(month)!.push(room);
    }
    return map;
  }, [dated]);

  const years = [...grouped.keys()].sort((a, b) => a - b);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorldPanelHeader
        icon={<Clock className="h-4 w-4 shrink-0 text-muted-foreground" />}
        title={t("nav.timeline")}
        right={
          <button
            aria-label={tCommon("close")}
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {years.map(year => {
          const monthMap = grouped.get(year)!;
          const monthKeys = [...monthMap.keys()].sort((a, b) => (a ?? -1) - (b ?? -1));
          return (
            <div key={year} className="relative pl-5">
              {/* Ligne verticale */}
              <div className="absolute left-0 top-3 bottom-0 w-px bg-border-soft" />

              {/* Titre année */}
              <div className="mb-2 flex items-center gap-2">
                <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                <h3 className="text-sm font-semibold">
                  {config.year_label} {year}{config.era_name ? ` ${config.era_name}` : ""}
                </h3>
              </div>

              <div className="space-y-3">
                {monthKeys.map(month => {
                  const roomsInGroup = monthMap.get(month)!;
                  const monthLabel = month !== null && config.month_names[month]
                    ? config.month_names[month]
                    : null;

                  return (
                    // Les salons ne sont plus décalés en plus du titre du
                    // mois (retrait supplémentaire retiré) : ça permettait au
                    // connecteur de ne couvrir QUE le pl-5 du wrapper année
                    // (mesuré en repro isolée : ligne à x=0, puce posée pile
                    // au bout, sans écart) au lieu d'un aller-retour plus
                    // long — la ligne courbée est donc plus courte.
                    <div key={month ?? "nomonth"} className="space-y-0.5">
                      {monthLabel && (
                        // `pl-3` réserve la place de la puce : posée en
                        // `absolute`, elle ne pousse pas le texte comme le
                        // ferait un enfant flex normal — sans ce padding, le
                        // titre du mois démarrait par-dessus la puce/courbe.
                        <div className="relative flex items-center pl-3">
                          {/* Ligne courbée façon fil de réponses imbriquées :
                              part du fil de l'année (`-left-5` = -20px, pile
                              le pl-5 du wrapper année) puis rejoint la puce du
                              mois — largeur = hauteur pour un quart de cercle.
                              `top-1/2 -translate-y-full` ancre le BAS de la
                              courbe (là où elle rejoint la puce) au centre
                              vertical de la ligne, comme la puce elle-même
                              (`top-1/2 -translate-y-1/2`) — un simple `top-0`
                              calait la courbe sur le HAUT de la ligne, un cran
                              plus haut que la puce, d'où le décalage. */}
                          <div className="absolute -left-5 top-1/2 h-5 w-5 -translate-y-full rounded-bl-lg border-b border-l border-border-soft" />
                          {/* `left-0`, pas de décalage négatif : la puce touche
                              exactement la pointe de la courbe, sans chevaucher
                              ni laisser d'écart. */}
                          <div className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-accent bg-background" />
                          <p className="text-sm font-medium text-foreground">{monthLabel}</p>
                        </div>
                      )}
                      {/* Une ligne par salon : le jour en colonne, puis le titre. */}
                      <ul className="pl-1">
                        {roomsInGroup.map(room => (
                          <li key={room.id}>
                            <RoomRow room={room} onClick={() => router.push(`/c/${room.id}`)} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {dated.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("timelineEmpty")}</p>
        )}
      </div>
    </div>
  );
}

function RoomRow({ room, onClick }: { room: TimelineRoom; onClick: () => void }) {
  const t = useTranslations("worlds");
  const label = room.title ?? room.name ?? t("timelineUntitled");
  const day = room.timeline_date?.day ?? null;
  const dayText = day !== null ? t("timelineDay", { day }) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      // Le titre d'abord, puis le jour en toutes lettres (la colonne n'en
      // montre que le numéro).
      aria-label={dayText ? `${label}, ${dayText}` : undefined}
      className="group flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Le jour, aligné en colonne ; vide quand la date s'arrête au mois. */}
      <span
        className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
        title={dayText ?? undefined}
        aria-hidden
      >
        {day}
      </span>
      {room.icon_url ? (
        <Image src={room.icon_url} alt="" width={20} height={20} className="h-5 w-5 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted">
          <MessageSquare className="h-3 w-3 text-muted-foreground" />
        </span>
      )}
      {/* Au survol, le titre change seulement de couleur : pas de fond sur toute la largeur. */}
      <span className="min-w-0 truncate font-medium transition-colors group-hover:text-primary">{label}</span>
    </button>
  );
}
