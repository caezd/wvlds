"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BarChart3 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { formatDaysAgo } from "@/lib/utils";
import { supabaseThumb } from "@/lib/storage";

type StatsUser = {
  profile_id: string;
  username: string | null;
  avatar_url: string | null;
  message_count: number;
  word_count: number;
  avg_words_per_message: number;
  first_message_at: string | null;
  last_message_at: string | null;
};

type StatsPersona = {
  persona_id: string;
  name: string | null;
  avatar_url: string | null;
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

function ParticipantRow({ label, sublabel, avatarUrl, badge, children }: {
  label: string;
  sublabel?: string;
  avatarUrl: string | null | undefined;
  badge: React.ReactNode;
  children: React.ReactNode;
}) {
  const initials = label.replace(/^@/, "").slice(0, 2).toUpperCase() || "?";
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border-soft bg-card p-4">
      <Avatar className="h-8 w-8 shrink-0 rounded-full">
        <AvatarImage src={supabaseThumb(avatarUrl, 64) ?? undefined} />
        <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-sm font-medium">{label}</span>
            {sublabel && (
              <span className="shrink-0 text-xs text-muted-foreground">{sublabel}</span>
            )}
          </div>
          {badge}
        </div>
        {children}
      </div>
    </div>
  );
}

function StatGrid({ wordCount, avg, lastAt }: {
  wordCount: number;
  avg: number;
  lastAt: string | null;
}) {
  const t = useTranslations("chatrooms");
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <div>{t("statsWords")} <span className="font-medium text-foreground">{wordCount}</span></div>
      <div>{t("statsAvg")} <span className="font-medium text-foreground">{Number(avg ?? 0).toFixed(1)} {t("statsWordsPerMsg")}</span></div>
      {lastAt && (
        <div className="col-span-2">
          {t("statsLastMessage")} <span className="font-medium text-foreground">{formatDaysAgo(new Date(lastAt))}</span>
        </div>
      )}
    </div>
  );
}

function MsgBadge({ count }: { count: number }) {
  const t = useTranslations("chatrooms");
  return (
    <span className="shrink-0 rounded-full bg-card-400 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
      {t("statsCount", { count })}
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
  const t = useTranslations("chatrooms");
  const supabase = createClient();
  const reconnectEpoch = useReconnectEpoch();
  const [open, setOpen] = useState(false);
  const [_loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ChatroomStatsPayload | null>(initialStats ?? null);
  const [personas, setPersonas] = useState<StatsPersona[]>([]);
  const [tab, setTab] = useState<"users" | "personas">("users");

  const refetchTimer = useRef<number | null>(null);
  function scheduleRefetch() {
    if (refetchTimer.current) window.clearTimeout(refetchTimer.current);
    refetchTimer.current = window.setTimeout(() => void fetchAll(), 150);
  }

  async function fetchAll() {
    setLoading(true);
    const [statsRes, personasRes] = await Promise.all([
      supabase.rpc("get_chatroom_stats", { p_chat_id: chatId }),
      supabase.rpc("get_chatroom_persona_stats", { p_chat_id: chatId }),
    ]);
    if (statsRes.error) toast.error("Impossible de charger les statistiques.", { description: statsRes.error.message });
    else setStats((statsRes.data as ChatroomStatsPayload) ?? null);
    if (!personasRes.error) setPersonas((personasRes.data as StatsPersona[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    void fetchAll();
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
  }, [open, chatId, reconnectEpoch]);

  const userRows = useMemo(() => stats?.users ?? [], [stats]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t("statsTitle")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>{t("statsTitle")}</TooltipContent>
      </Tooltip>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border-soft px-6 py-4">
            <SheetTitle>{t("statsTitle")}</SheetTitle>
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

            {/* Onglets par participant / par persona */}
            <div>
              <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
                {(["users", "personas"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={[
                      "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      tab === t
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {t === "users" ? "Par participant" : "Par persona"}
                  </button>
                ))}
              </div>

              {tab === "users" ? (
                !userRows.length ? (
                  <p className="text-sm text-muted-foreground">Aucune donnée.</p>
                ) : (
                  <div className="space-y-2">
                    {userRows.map((u) => {
                      const displayName = u.username ? `@${u.username}` : u.profile_id.slice(0, 8);
                      return (
                        <ParticipantRow
                          key={u.profile_id}
                          label={displayName}
                          avatarUrl={u.avatar_url}
                          badge={<MsgBadge count={u.message_count} />}
                        >
                          <StatGrid wordCount={u.word_count} avg={u.avg_words_per_message} lastAt={u.last_message_at} />
                        </ParticipantRow>
                      );
                    })}
                  </div>
                )
              ) : (
                !personas.length ? (
                  <p className="text-sm text-muted-foreground">Aucune donnée.</p>
                ) : (
                  <div className="space-y-2">
                    {personas.map((pe) => {
                      const displayName = pe.name ?? pe.persona_id.slice(0, 8);
                      return (
                        <ParticipantRow
                          key={pe.persona_id}
                          label={displayName}
                          sublabel={pe.username ? `@${pe.username}` : undefined}
                          avatarUrl={pe.avatar_url}
                          badge={<MsgBadge count={pe.message_count} />}
                        >
                          <StatGrid wordCount={pe.word_count} avg={pe.avg_words_per_message} lastAt={pe.last_message_at} />
                        </ParticipantRow>
                      );
                    })}
                  </div>
                )
              )}
            </div>

          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
