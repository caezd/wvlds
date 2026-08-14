"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MessageSquare, UserRound, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type WorldStats = {
  message_count: number;
  member_count: number;
  persona_count: number;
};

export function WorldStatsWidget({ worldId }: { worldId: string }) {
  const t = useTranslations("explore");
  const [stats, setStats] = useState<WorldStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    setLoading(true);
    supabase
      .rpc("get_world_public_stats", { p_world_id: worldId })
      .then(({ data }: { data: WorldStats | null }) => {
        if (cancelled) return;
        setStats(data ?? { message_count: 0, member_count: 0, persona_count: 0 });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [worldId]);

  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border p-3">
      <StatTile icon={<MessageSquare className="h-4 w-4" />} value={stats?.message_count} loading={loading} label={t("statsMessages")} />
      <StatTile icon={<Users className="h-4 w-4" />} value={stats?.member_count} loading={loading} label={t("statsMembers")} />
      <StatTile icon={<UserRound className="h-4 w-4" />} value={stats?.persona_count} loading={loading} label={t("statsPersonas")} />
    </div>
  );
}

function StatTile({
  icon,
  value,
  loading,
  label,
}: {
  icon: ReactNode;
  value?: number;
  loading: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md bg-muted/30 py-3 text-center">
      <span className="text-muted-foreground">{icon}</span>
      {loading ? (
        <span className="h-5 w-8 animate-pulse rounded bg-muted" />
      ) : (
        <span className="text-base font-bold tabular-nums">{value ?? 0}</span>
      )}
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
