"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { getLeadingLetter } from "@/lib/textFormatting";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MembersOnlineStyle } from "../worldHomeGrid";

type Member = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
};

const DEFAULT_MAX_SHOWN = 8;

function displayNameOf(m: Member) {
  return m.username ? `@${m.username}` : m.user_id.slice(0, 8);
}

function MemberAvatar({ member, className }: { member: Member; className?: string }) {
  return (
    <Avatar className={className}>
      <AvatarImage src={member.avatar_url ?? undefined} alt="" className="rounded-full" />
      <AvatarFallback className="rounded-full text-[10px]">{getLeadingLetter(displayNameOf(member))}</AvatarFallback>
    </Avatar>
  );
}

export function WorldMembersOnlineWidget({
  worldId,
  limit = DEFAULT_MAX_SHOWN,
  style = "avatars",
}: {
  worldId: string;
  /** Nombre d'avatars affichés avant le compteur « +N » — réglage du widget
   *  (voir WORLD_HOME_WIDGET_OPTIONS). */
  limit?: number;
  /** Rangée d'avatars empilés, ou liste des noms — à la suite, séparés par
   *  des virgules, dans un bloc large ; un par ligne dans un bloc étroit.
   *  Réglage du widget (voir WORLD_HOME_WIDGET_OPTIONS). */
  style?: MembersOnlineStyle;
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
  const href = `/w/${worldId}?view=members`;
  const countLabel = online.length > 0 ? t("home.onlineCount", { count: online.length }) : t("home.noneOnline");

  // Même hauteur que le faux composeur « Nouveau jeu… » (WorldChatComposer :
  // px-4 py-3 + une ligne de text-sm = 44 px) pour que les deux blocs
  // s'alignent sur une même ligne : ici l'avatar de 24 px impose py-2.5, et
  // min-h-11 garde la hauteur quand il n'y a que du texte.
  const headerClass = "flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground";

  if (style === "list") {
    return (
      <div className="rounded-lg border">
        <div className={headerClass}>
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{countLabel}</span>
          <Link
            href={href}
            aria-label={t("nav.members")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {shown.length > 0 && (
          <div className="border-t border-border-soft">
            {/* Deux rendus du même contenu, un seul visible à la fois, selon la
                largeur de la CELLULE (container query, voir WorldHomeGridView) :
                les noms à la suite, séparés par des virgules, quand le bloc est
                large ; un membre par ligne quand il est étroit. */}
            <p className="hidden px-4 py-2.5 text-sm leading-6 text-muted-foreground @md:block">
              {shown.map((m, i) => (
                <span key={m.user_id}>
                  {i > 0 && ", "}
                  <span className="text-foreground">{displayNameOf(m)}</span>
                </span>
              ))}
              {overflow > 0 && <span> +{overflow}</span>}
            </p>
            <ul className="py-1 @md:hidden">
              {shown.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2.5 px-4 py-1.5 text-sm">
                  <MemberAvatar member={m} className="size-6 rounded-full" />
                  <span className="min-w-0 flex-1 truncate">{displayNameOf(m)}</span>
                </li>
              ))}
              {overflow > 0 && (
                <li className="px-4 py-1.5 text-xs text-muted-foreground">+{overflow}</li>
              )}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <Link href={href} className={`${headerClass} rounded-lg border transition-colors hover:bg-hoverCard`}>
      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{countLabel}</span>
      {shown.length > 0 && (
        <div className="flex -space-x-1.5 shrink-0">
          {shown.map((m) => (
            <Tooltip key={m.user_id}>
              <TooltipTrigger asChild>
                <span>
                  <MemberAvatar member={m} className="size-6 rounded-full ring-2 ring-background" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {displayNameOf(m)}
              </TooltipContent>
            </Tooltip>
          ))}
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
