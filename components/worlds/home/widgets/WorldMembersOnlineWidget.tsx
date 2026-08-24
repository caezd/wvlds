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

const DEFAULT_MAX_SHOWN = 8;

export function WorldMembersOnlineWidget({
  worldId,
  limit = DEFAULT_MAX_SHOWN,
}: {
  worldId: string;
  /** Nombre d'avatars affichés avant le compteur « +N » — réglage du widget
   *  (voir WORLD_HOME_WIDGET_OPTIONS). */
  limit?: number;
}) {
  const t = useTranslations("worlds");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [online, setOnline] = useState<Member[]>([]);
  const { onlineUsers } = useGlobalPresence();
  const reconnectEpoch = useReconnectEpoch();

  useEffect(() => {
    const supabase = createClient();

    const load = async () => {
      const { data: memberRows } = await supabase
        .from("world_members")
        .select("user_id")
        .eq("world_id", worldId);
      setMemberIds(((memberRows ?? []) as { user_id: string }[]).map((m) => m.user_id));
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

  // Membres présents à la fois dans world_members et dans la présence globale
  // (temps réel, tous mondes confondus) — seuls ceux-ci ont besoin d'un profil.
  const onlineMemberIds = useMemo(
    () => memberIds.filter((id) => !!onlineUsers[id]),
    [memberIds, onlineUsers],
  );
  // Clé stable (triée) pour ne relancer la requête profils que si l'ensemble
  // des membres en ligne change réellement, pas à chaque battement de présence.
  const onlineMemberIdsKey = [...onlineMemberIds].sort().join(",");

  useEffect(() => {
    if (onlineMemberIds.length === 0) {
      setOnline([]);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", onlineMemberIds);
      if (cancelled) return;
      const profileById = new Map(
        ((profileRows ?? []) as { id: string; username: string | null; avatar_url: string | null }[]).map((p) => [
          p.id,
          p,
        ]),
      );
      // Mise à jour atomique : évite un flash d'initiales dérivées de l'id
      // avant que le profil (nom, avatar) ne soit chargé.
      setOnline(
        onlineMemberIds.map((id) => ({
          user_id: id,
          username: profileById.get(id)?.username ?? null,
          avatar_url: profileById.get(id)?.avatar_url ?? null,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onlineMemberIdsKey est une clé stable dérivée de onlineMemberIds
  }, [onlineMemberIdsKey]);

  const shown = online.slice(0, limit);
  const overflow = online.length - shown.length;

  return (
    <Link
      href={`/w/${worldId}?view=members`}
      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-hoverCard"
    >
      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
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
