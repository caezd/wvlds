"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { BarChart3, RefreshCw } from "lucide-react";
import { cn, formatDaysAgo } from "@/lib/utils";

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
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
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
  const scheduleRefetch = () => {
    if (refetchTimer.current) window.clearTimeout(refetchTimer.current);
    refetchTimer.current = window.setTimeout(() => {
      void fetchStats();
    }, 150); // coalesce burst updates (INSERT => 2 updates stats tables)
  };

  async function fetchStats() {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_chatroom_stats", {
      p_chat_id: chatId,
    });

    if (!error) {
      setStats((data as any) ?? null);
    }
    setLoading(false);
  }

  // Charge au moment d’ouvrir (ou si pas de cache)
  useEffect(() => {
    if (!open) return;
    if (!stats) void fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Realtime: écouter les tables d’agrégats, pas chat_messages
  useEffect(() => {
    if (!open) return;

    const ch = supabase
      .channel(`chatroom-stats:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chatroom_stats",
          filter: `chat_id=eq.${chatId}`,
        },
        () => scheduleRefetch(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chatroom_user_stats",
          filter: `chat_id=eq.${chatId}`,
        },
        () => scheduleRefetch(),
      )
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
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={() => setOpen(true)}
        aria-label="Statistiques"
      >
        <BarChart3 size={18} />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[420px] sm:w-[520px]">
          <SheetHeader>
            <SheetTitle>Statistiques</SheetTitle>
          </SheetHeader>

          {/* <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {stats?.updated_at
                ? `Mis à jour : ${new Date(stats.updated_at).toLocaleString()}`
                : "—"}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchStats()}
              disabled={loading}
            >
              <RefreshCw
                className={cn("mr-2", loading && "animate-spin")}
                size={14}
              />
              Rafraîchir
            </Button>
            </div> */}

          <div className="grid grid-cols-2 gap-3 text-sm px-4">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Réponses</div>
              <div className="text-lg font-semibold">
                {stats?.message_count ?? "—"}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Participants</div>
              <div className="text-lg font-semibold">
                {stats?.participant_count ?? "—"}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Plus petit délai
              </div>
              <div className="text-lg font-semibold">
                {fmtGap(stats?.min_gap_seconds ?? null)}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Plus grand délai
              </div>
              <div className="text-lg font-semibold">
                {fmtGap(stats?.max_gap_seconds ?? null)}
              </div>
            </div>
          </div>

          {stats?.needs_recompute && (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Certains messages semblent hors ordre temporel. Les délais min/max
              peuvent nécessiter un recalcul complet.
            </div>
          )}

          <div className="mt-6">
            <div className="mb-2 text-sm font-medium">
              Mots et réponses par utilisateur
            </div>

            <div className="space-y-2">
              {!rows.length && (
                <div className="text-sm text-muted-foreground">
                  Aucune donnée.
                </div>
              )}

              {rows.map((u) => (
                <div key={u.profile_id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {u.username ? `@${u.username}` : u.profile_id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {u.message_count} msg · {u.word_count} mots
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      Moy. mots/msg :{" "}
                      <span className="text-foreground">
                        {Number(u.avg_words_per_message ?? 0).toFixed(1)}
                      </span>
                    </div>
                    <div className="truncate">
                      Dernier :{" "}
                      <span className="text-foreground">
                        {u.last_message_at
                          ? formatDaysAgo(new Date(u.last_message_at))
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
