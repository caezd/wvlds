"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BarChart3 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { formatDaysAgo } from "@/lib/utils";

type StatsUser = {
  profile_id: string;
  username: string | null;
  message_count: number;
  word_count: number;
  avg_words_per_message: number;
  first_message_at: string | null;
  last_message_at: string | null;
};

type ChatroomStatsPayload = {
  chat_id: string;
  message_count: number;
  participant_count: number;
  min_gap_seconds: number | null;
  max_gap_seconds: number | null;
  needs_recompute: boolean;
  updated_at: string;
  users: StatsUser[];
};

function fmtGap(sec: number | null) {
  if (sec == null) return "—";
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

function Initials({ name }: { name: string }) {
  const letter = (name.replace(/^@/, "")[0] ?? "?").toUpperCase();
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card-400 text-xs font-semibold text-foreground">
      {letter}
    </span>
  );
}

export default function ChatroomStatsSheet({
  chatId,
  initialStats,
}: {
  chatId: string;
  initialStats?: ChatroomStatsPayload | null;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ChatroomStatsPayload | null>(
    initialStats ?? null,
  );

  const refetchTimer = useRef<number | null>(null);
  function scheduleRefetch() {
    if (refetchTimer.current) window.clearTimeout(refetchTimer.current);
    refetchTimer.current = window.setTimeout(() => void fetchStats(), 150);
  }

  async function fetchStats() {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_chatroom_stats", {
      p_chat_id: chatId,
    });
    if (error) toast.error("Impossible de charger les statistiques.", { description: error.message });
    else setStats((data as any) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    void fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ch = supabase
      .channel(`chatroom-stats:${chatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` }, scheduleRefetch)
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
      if (refetchTimer.current) window.clearTimeout(refetchTimer.current);
      refetchTimer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chatId]);

  const rows = useMemo(() => stats?.users ?? [], [stats]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Statistiques"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>Statistiques</TooltipContent>
      </Tooltip>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border-soft px-6 py-4">
            <SheetTitle>Statistiques</SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto p-6">

            {/* Chiffres clés */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Messages", value: stats?.message_count ?? "—" },
                { label: "Participants", value: stats?.participant_count ?? "—" },
                { label: "Délai min.", value: fmtGap(stats?.min_gap_seconds ?? null) },
                { label: "Délai max.", value: fmtGap(stats?.max_gap_seconds ?? null) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-border-soft bg-card p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            {stats?.needs_recompute && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-400">
                Certains messages semblent hors ordre temporel. Les délais min/max peuvent nécessiter un recalcul complet.
              </div>
            )}

            {/* Par utilisateur */}
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Par participant
              </p>

              {!rows.length ? (
                <p className="text-sm text-muted-foreground">Aucune donnée.</p>
              ) : (
                <div className="space-y-2">
                  {rows.map((u) => {
                    const displayName = u.username ? `@${u.username}` : u.profile_id.slice(0, 8);
                    return (
                      <div key={u.profile_id} className="flex items-start gap-3 rounded-xl border border-border-soft bg-card p-4">
                        <Initials name={displayName} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{displayName}</span>
                            <span className="shrink-0 rounded-full bg-card-400 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                              {u.message_count} msg
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <div>
                              Mots{" "}
                              <span className="font-medium text-foreground">{u.word_count}</span>
                            </div>
                            <div>
                              Moy.{" "}
                              <span className="font-medium text-foreground">
                                {Number(u.avg_words_per_message ?? 0).toFixed(1)} mots/msg
                              </span>
                            </div>
                            {u.last_message_at && (
                              <div className="col-span-2">
                                Dernier message{" "}
                                <span className="font-medium text-foreground">
                                  {formatDaysAgo(new Date(u.last_message_at))}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
