"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, ChevronLeft, ChevronRight, CirclePause } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatTimelineLabel } from "@/lib/worldTimeline";
import { relativeTime } from "@/lib/relativeTime";
import type { TimelineRoomStatus } from "@/lib/worldTimelineItems";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerTitle } from "@/components/ui/drawer";
import { loadRoomPreview, type RoomPreviewData } from "@/components/worlds/timeline/TimelineRoomPreview";
import type { TimelineArc, TimelinePersona } from "@/components/worlds/timeline/useTimelineData";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

export type DrawerRoom = { id: string; title: string; date: WorldTimelineDate; status: TimelineRoomStatus };
export type DrawerEpisode = DrawerRoom & { rank: number };

/** La marque d'un statut à la couleur de l'arc : creux, plein, pause, pointillés. */
function StatusDot({ status, color }: { status: TimelineRoomStatus; color: string | null }) {
  if (status === "dormant") {
    return <CirclePause className="size-3.5 shrink-0" strokeWidth={3} style={color ? { color } : undefined} aria-hidden />;
  }
  return (
    <span
      className={cn(
        "size-3 shrink-0 rounded-full border-2",
        !color && "border-foreground/40",
        status === "abandoned" && "border-dashed",
        status === "completed" && !color && "bg-foreground/40",
      )}
      style={color ? { borderColor: color, ...(status === "completed" ? { backgroundColor: color } : {}) } : undefined}
      aria-hidden
    />
  );
}

/**
 * Sur un écran tactile, où l'aperçu au survol n'existe pas : un tiroir par le
 * bas, ouvert d'un appui sur un salon de la frise. L'arc et le rang de
 * l'épisode, le titre, la date et le statut, les participants, le dernier
 * message, les épisodes de l'arc (un appui en ouvre un autre), et en pied :
 * le salon d'avant et d'après sur la frise, et « Ouvrir le salon ».
 */
export function TimelineRoomDrawer({
  open,
  onOpenChange,
  config,
  supabase,
  room,
  arc,
  rank,
  episodes,
  participants,
  previousId,
  nextId,
  onSelect,
  onOpenRoom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: WorldTimelineConfig;
  supabase: SupabaseClient;
  room: DrawerRoom | null;
  arc: TimelineArc | null;
  /** Son rang d'épisode, s'il en a un (voir arcRanks). */
  rank: number | null;
  /** Les épisodes de son arc, dans l'ordre. */
  episodes: readonly DrawerEpisode[];
  participants: readonly TimelinePersona[];
  previousId: string | null;
  nextId: string | null;
  onSelect: (id: string) => void;
  onOpenRoom: (id: string) => void;
}) {
  const tv = useTranslations("worlds.timelineView");
  const locale = useLocale();
  const [preview, setPreview] = useState<{ id: string; data: RoomPreviewData } | null>(null);
  const roomId = room?.id ?? null;
  useEffect(() => {
    if (!roomId || !open) return;
    let alive = true;
    loadRoomPreview(supabase, roomId).then(
      (data) => { if (alive) setPreview({ id: roomId, data }); },
      (e: unknown) => console.error("[TimelineRoomDrawer] aperçu", e),
    );
    return () => { alive = false; };
  }, [supabase, roomId, open]);
  const data = preview && preview.id === roomId ? preview.data : null;

  const shortDate = (d: WorldTimelineDate) => {
    const year = `${config.year_label} ${d.year}`;
    const month = d.month !== null ? config.month_names[d.month] : null;
    return month ? `${month.slice(0, 3)} · ${year}` : year;
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent
        // Comme le tiroir de navigation d'un monde (AppShell) : même arrondi, même fond.
        className="rounded-md border bg-background text-foreground shadow-lg"
        data-testid="timeline-room-drawer"
      >
        {room && (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-3">
              {arc && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: `${arc.color}26`, color: arc.color }}
                  data-testid="timeline-drawer-arc"
                >
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: arc.color }} aria-hidden />
                  {arc.name}
                  {rank !== null && episodes.length > 0 && <span className="tabular-nums">· {rank}/{episodes.length}</span>}
                </span>
              )}
              <div className="space-y-0.5">
                <DrawerTitle className="text-xl font-semibold">{room.title}</DrawerTitle>
                <DrawerDescription className="text-sm text-muted-foreground">
                  {formatTimelineLabel(config, room.date)}
                  {room.status !== "active" && ` · ${tv(`roomStatus.${room.status}`).toLocaleLowerCase(locale)}`}
                </DrawerDescription>
              </div>

              {participants.length > 0 && (
                <ul className="flex flex-wrap gap-2" data-testid="timeline-drawer-people">
                  {participants.map((p) => (
                    <li key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2.5 text-sm">
                      <span
                        className="flex size-6 items-center justify-center rounded-full border-2 bg-background text-[10px] font-semibold"
                        style={{ borderColor: p.color ?? "var(--color-border)" }}
                        aria-hidden
                      >
                        {p.name.trim().charAt(0).toUpperCase()}
                      </span>
                      {p.name}
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-1.5 rounded-md bg-muted/50 p-3" data-testid="timeline-drawer-last">
                {data === null ? (
                  <div className="space-y-1.5" aria-busy="true">
                    <span className="block h-3 w-1/2 animate-pulse rounded bg-muted" />
                    <span className="block h-3.5 w-full animate-pulse rounded bg-muted" />
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {[
                        tv("drawerLastMessage"),
                        data.lastAt && relativeTime(data.lastAt, locale, tv("previewJustNow"), Date.now(), 365),
                        data.count > 0 && tv("previewMessages", { count: data.count }),
                      ].filter(Boolean).join(" · ")}
                    </p>
                    {data.excerpt ? (
                      <p className="italic text-foreground/90">{tv("previewQuote", { text: data.excerpt })}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">{tv("previewEmpty")}</p>
                    )}
                  </>
                )}
              </div>

              {arc && episodes.length > 0 && (
                <section aria-label={tv("drawerEpisodes")} className="space-y-1">
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{tv("drawerEpisodes")}</h3>
                  <ul className="-mx-2">
                    {episodes.map((ep) => {
                      const current = ep.id === room.id;
                      return (
                        <li key={ep.id}>
                          <button
                            type="button"
                            onClick={() => onSelect(ep.id)}
                            aria-current={current ? "true" : undefined}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left",
                              current ? "bg-muted font-semibold" : "hover:bg-muted/50",
                            )}
                          >
                            <span className="w-4 shrink-0 text-right text-sm font-semibold tabular-nums" style={{ color: arc.color }}>
                              {ep.rank}
                            </span>
                            <StatusDot status={ep.status} color={arc.color} />
                            <span className="min-w-0 flex-1 truncate">{ep.title}</span>
                            <span className="shrink-0 text-xs font-normal text-muted-foreground">{shortDate(ep.date)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>

            <DrawerFooter className="flex-row items-center gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 rounded-md"
                aria-label={tv("drawerPrevious")}
                disabled={!previousId}
                onClick={() => previousId && onSelect(previousId)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 rounded-md"
                aria-label={tv("drawerNext")}
                disabled={!nextId}
                onClick={() => nextId && onSelect(nextId)}
              >
                <ChevronRight className="size-4" />
              </Button>
              <Button type="button" className="h-10 flex-1 gap-2 rounded-md" onClick={() => onOpenRoom(room.id)}>
                {tv("drawerOpen")}
                <ArrowRight className="size-4" />
              </Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
