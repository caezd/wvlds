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

/** Rangée compacte de statistiques, affichée sous le titre de la page d'accueil. */
export function WorldStatsWidget({ worldId }: { worldId: string }) {
  const t = useTranslations("explore");
  const [stats, setStats] = useState<WorldStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .rpc("get_world_public_stats", { p_world_id: worldId })
      .then(({ data }: { data: WorldStats | null }) => {
        if (cancelled) return;
        setStats(data ?? { message_count: 0, member_count: 0, persona_count: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [worldId]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <StatPill icon={<MessageSquare className="h-3.5 w-3.5" />} value={stats?.message_count} label={t("statsMessages")} />
      <StatPill icon={<Users className="h-3.5 w-3.5" />} value={stats?.member_count} label={t("statsMembers")} />
      <StatPill icon={<UserRound className="h-3.5 w-3.5" />} value={stats?.persona_count} label={t("statsPersonas")} />
    </div>
  );
}

function StatPill({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value?: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {value === undefined ? (
        <span className="h-3.5 w-6 animate-pulse rounded bg-muted" />
      ) : (
        <span className="font-medium tabular-nums text-foreground">{value}</span>
      )}
      <span>{label}</span>
    </span>
  );
}
