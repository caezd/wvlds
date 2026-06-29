"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
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
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-soft px-5 py-3">
        <h2 className="text-sm font-semibold">Chronologie</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

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
                    <div key={month ?? "nomonth"} className="space-y-2">
                      {monthLabel && (
                        <p className="text-xs font-medium text-muted-foreground">{monthLabel}</p>
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={room.icon_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
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
