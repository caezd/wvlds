"use client";

import { useLocale, useTranslations } from "next-intl";
import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { WorldMemberCardFields } from "@/lib/worldMembers";
import type { WorldRoleRow } from "@/lib/worldPermissions";
import type { WorldMemberStatus } from "@/types/db";

export type PresenceState = "online" | "away" | "offline";

export type WorldMemberCardData = WorldMemberCardFields & {
  user_id: string;
  isOwner: boolean;
  username: string | null;
  avatar_url: string | null;
  /** Rôles portés, du plus haut au plus bas. */
  roles: WorldRoleRow[];
  /** Statut effectif (une pause dont la date est passée vaut « actif »). */
  effectiveStatus: WorldMemberStatus;
};

/** Fenêtre pendant laquelle un anniversaire s'annonce sur la carte. */
export const BIRTHDAY_WINDOW_DAYS = 30;

export function displayNameOf(member: Pick<WorldMemberCardData, "username" | "user_id">) {
  return member.username ? `@${member.username}` : member.user_id.slice(0, 8);
}

// ── MemberStatusBadge ────────────────────────────────────────────────────────

/** « En pause » / « Absent jusqu'au 15 oct. », le mot d'explication au survol. */
export function MemberStatusBadge({
  status,
  until,
  note,
  className,
}: {
  status: WorldMemberStatus;
  until: string | null;
  note: string | null;
  className?: string;
}) {
  const t = useTranslations("worlds.members.status");
  const locale = useLocale();
  if (status === "active") return null;
  const untilLabel = until
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${until}T00:00:00Z`))
    : null;
  const label = untilLabel ? t(`${status}Until`, { date: untilLabel }) : t(status);
  return (
    <Badge
      data-status={status}
      title={note ?? undefined}
      tone={status === "paused" ? "warning" : "danger"}
      className={className}
    >
      <Clock aria-hidden />
      <span className="truncate">{label}</span>
    </Badge>
  );
}
