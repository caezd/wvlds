"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { getLeadingLetter } from "@/lib/textFormatting";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Member = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
};

const MAX_SHOWN = 8;

export function WorldMembersOnlineWidget({ worldId }: { worldId: string }) {
  const t = useTranslations("worlds");
  const [members, setMembers] = useState<Member[]>([]);
  const { onlineUsers } = useGlobalPresence();
  const reconnectEpoch = useReconnectEpoch();

  useEffect(() => {
    const supabase = createClient();

    const load = async () => {
      const { data: memberRows } = await supabase
        .from("world_members")
        .select("user_id")
        .eq("world_id", worldId);
      const userIds = ((memberRows ?? []) as { user_id: string }[]).map((m) => m.user_id);
      if (userIds.length === 0) {
        setMembers([]);
        return;
      }
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", userIds);
      const profileById = new Map(
        ((profileRows ?? []) as { id: string; username: string | null; avatar_url: string | null }[]).map((p) => [p.id, p]),
      );
      setMembers(
        userIds.map((id) => ({
          user_id: id,
          username: profileById.get(id)?.username ?? null,
          avatar_url: profileById.get(id)?.avatar_url ?? null,
        })),
      );
    };

    void load();

    const channel = supabase
      .channel(`world_members_online:${worldId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "world_members", filter: `world_id=eq.${worldId}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [worldId, reconnectEpoch]);

  const online = useMemo(
    () => members.filter((m) => !!onlineUsers[m.user_id]),
    [members, onlineUsers],
  );
  const shown = online.slice(0, MAX_SHOWN);
  const overflow = online.length - shown.length;

  return (
    <Link
      href={`/w/${worldId}?view=members`}
      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-hoverCard"
    >
      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-sm font-medium text-foreground">
        {online.length > 0 ? t("home.onlineCount", { count: online.length }) : t("home.noneOnline")}
      </span>
      {shown.length > 0 && (
        <div className="flex -space-x-1.5 shrink-0">
          {shown.map((m) => {
            const displayName = m.username ? `@${m.username}` : m.user_id.slice(0, 8);
            return (
              <Tooltip key={m.user_id}>
                <TooltipTrigger asChild>
                  <span>
                    <Avatar className="size-6 rounded-full ring-2 ring-background">
                      <AvatarImage src={m.avatar_url ?? undefined} alt="" className="rounded-full" />
                      <AvatarFallback className="rounded-full text-[10px]">
                        {getLeadingLetter(displayName)}
                      </AvatarFallback>
                    </Avatar>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  {displayName}
                </TooltipContent>
              </Tooltip>
            );
          })}
          {overflow > 0 && (
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground ring-2 ring-background">
              +{overflow}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
