"use client";

import { useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Clock, X, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
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
        title="Chronologie"
        right={
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-8">
        {years.map(year => {
          const monthMap = grouped.get(year)!;
          const monthKeys = [...monthMap.keys()].sort((a, b) => (a ?? -1) - (b ?? -1));
          return (
            <div key={year} className="relative pl-5">
              {/* Ligne verticale */}
              <div className="absolute left-0 top-3 bottom-0 w-px bg-border-soft" />

              {/* Titre année */}
              <div className="mb-4 flex items-center gap-2">
                <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                <h3 className="text-sm font-semibold">
                  {config.year_label} {year}{config.era_name ? ` ${config.era_name}` : ""}
                </h3>
              </div>

              <div className="space-y-5">
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
                    <div key={month ?? "nomonth"} className="space-y-2">
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
                      <div className="grid gap-2">
                        {roomsInGroup.map(room => (
                          <RoomCard
                            key={room.id}
                            room={room}
                            onClick={() => router.push(`/c/${room.id}`)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {dated.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune conversation n&apos;a encore été située dans la chronologie.</p>
        )}
      </div>
    </div>
  );
}

function RoomCard({ room, onClick }: { room: TimelineRoom; onClick: () => void }) {
  const label = room.title ?? room.name ?? "Conversation";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-border-soft bg-background px-3 py-2.5",
        "text-left text-sm transition-colors hover:bg-secondary",
      )}
    >
      {room.icon_url ? (
        <Image src={room.icon_url} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="truncate font-medium">{label}</span>
        {room.timeline_date?.day !== null && room.timeline_date?.day !== undefined && (
          <span className="text-[11px] text-muted-foreground">Jour {room.timeline_date.day}</span>
        )}
      </span>
    </button>
  );
}
