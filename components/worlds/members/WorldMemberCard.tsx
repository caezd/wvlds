"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Cake, CalendarClock, Clock, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import { getLeadingLetter, getInitials } from "@/lib/textFormatting";
import { daysUntilBirthday, formatBirthday, localTimeIn, relativeTime } from "@/lib/relativeTime";
import type { WorldMemberActivity, WorldMemberCardFields } from "@/lib/worldMembers";
import type { WorldMemberPersona } from "@/lib/worldMemberPersonas";
import type { WorldRoleRow } from "@/lib/worldPermissions";
import type { WorldMemberStatus } from "@/types/db";
import { ChatroomAvatarWithPresence } from "@/components/chatrooms/persona/ChatroomAvatarWithPresence";
import { PresenceDot } from "@/components/avatars/PresenceDot";
import { UserProfileSheetTrigger } from "@/components/profile/UserProfileSheetTrigger";
import { PersonaProfileSheetTrigger } from "@/components/personas/PersonaProfileSheetTrigger";
import { RoleChip } from "./RoleChip";

export type PresenceState = "online" | "away" | "offline";

export type WorldMemberCardData = WorldMemberCardFields & {
  user_id: string;
  isOwner: boolean;
  username: string | null;
  avatar_url: string | null;
  /** Rôles portés, du plus haut au plus bas. */
  roles: WorldRoleRow[];
  personas: WorldMemberPersona[];
  /** Statut effectif (une pause dont la date est passée vaut « actif »). */
  effectiveStatus: WorldMemberStatus;
};

const MAX_PERSONA_CHIPS = 4;
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
    <span
      data-status={status}
      title={note ?? undefined}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "paused" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-sky-500/15 text-sky-700 dark:text-sky-300",
        className,
      )}
    >
      <Clock className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

// ── PersonaChip ──────────────────────────────────────────────────────────────

function PersonaChip({ persona, userId }: { persona: WorldMemberPersona; userId: string }) {
  const name = persona.name || "?";
  return (
    <PersonaProfileSheetTrigger
      personaId={persona.id}
      userId={userId}
      label={name}
      triggerClassName="flex max-w-full items-center gap-1.5 rounded-full border border-border-soft bg-muted/40 py-0.5 pl-0.5 pr-2.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChatroomAvatarWithPresence
        url={persona.avatar_url}
        alt=""
        fallback={getInitials(name, "P")}
        presenceState="invisible"
        size={20}
        className="rounded-full"
      />
      <span className="truncate">{name}</span>
    </PersonaProfileSheetTrigger>
  );
}

// ── WorldMemberCard ──────────────────────────────────────────────────────────

export function WorldMemberCard({
  member,
  presence,
  activity,
  manage,
  now = new Date(),
}: {
  member: WorldMemberCardData;
  presence: PresenceState;
  /** Messages et dernière prise de parole dans ce monde ; `undefined` : pas encore chargé. */
  activity?: WorldMemberActivity;
  /** Le menu « ⋯ », quand le lecteur peut gérer ce membre. */
  manage?: ReactNode;
  /** Injectable pour les tests (heure locale, anniversaire). */
  now?: Date;
}) {
  const t = useTranslations("worlds.members");
  const tPresence = useTranslations("presence");
  const locale = useLocale();
  const displayName = displayNameOf(member);
  const shown = member.personas.slice(0, MAX_PERSONA_CHIPS);
  const rest = member.personas.length - shown.length;
  const away = member.effectiveStatus !== "active";

  const localTime = member.timezone ? localTimeIn(member.timezone, locale, now) : null;
  const birthdayIn =
    member.birthday_month && member.birthday_day
      ? daysUntilBirthday(member.birthday_month, member.birthday_day, now)
      : null;
  const birthdaySoon = birthdayIn !== null && birthdayIn <= BIRTHDAY_WINDOW_DAYS;

  return (
    <article
      data-presence={presence}
      data-status={member.effectiveStatus}
      className={cn("flex flex-col gap-3 rounded-lg border border-border-soft p-3", away && "bg-muted/20")}
    >
      <div className="flex items-start gap-3">
        <UserProfileSheetTrigger userId={member.user_id} label={t("openProfile", { name: displayName })}>
          <ChatroomAvatarWithPresence
            url={member.avatar_url}
            alt=""
            fallback={getLeadingLetter(displayName)}
            presenceState="invisible"
            size={48}
            className={cn("rounded-full text-base", away && "opacity-70 grayscale")}
          />
        </UserProfileSheetTrigger>

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <MemberStatusBadge status={member.effectiveStatus} until={member.status_until} note={member.status_note} />
          </div>
          {/* La pastille accompagne le statut, comme sur la fiche de profil. */}
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <PresenceDot state={presence} />
            {tPresence(presence)}
          </p>
        </div>
        {/* L'activité, en chiffres seulement, à droite du nom : le nombre de
            messages et la dernière prise de parole ; le détail au survol. */}
        {activity && (
          <dl className="shrink-0 space-y-1 pt-0.5 text-right text-xs text-muted-foreground" data-testid="member-activity">
            <div className="flex items-center justify-end gap-1" title={t("card.messages", { count: activity.message_count })}>
              <dt className="sr-only">{t("card.messages", { count: activity.message_count })}</dt>
              <MessageSquare className="h-3 w-3 shrink-0" aria-hidden />
              <dd className="tabular-nums">{activity.message_count}</dd>
            </div>
            {activity.last_message_at && (
              <div
                className="flex items-center justify-end gap-1"
                title={t("card.lastActive", { when: relativeTime(activity.last_message_at, locale, t("card.justNow"), now.getTime()) })}
              >
                <dt className="sr-only">{t("card.activity")}</dt>
                <Clock className="h-3 w-3 shrink-0" aria-hidden />
                <dd className="truncate">{relativeTime(activity.last_message_at, locale, t("card.justNow"), now.getTime())}</dd>
              </div>
            )}
          </dl>
        )}
        {manage}
      </div>

      {/* Un membre peut cumuler plusieurs rôles : la section ne dit que le plus
          haut, les puces disent tous les autres. */}
      {member.roles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" data-testid="member-roles">
          {member.roles.map((r) => (
            <RoleChip key={r.id} role={r} />
          ))}
        </div>
      )}

      {member.bio && <p className="line-clamp-2 text-xs text-muted-foreground">{member.bio}</p>}

      {(member.availability || localTime || birthdaySoon) && (
        <dl className="space-y-1 text-xs text-muted-foreground">
          {(member.availability || localTime) && (
            <div className="flex items-center gap-1.5">
              <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
              <dt className="sr-only">{t("card.availability")}</dt>
              <dd className="truncate">
                {member.availability}
                {member.availability && localTime && " · "}
                {localTime && t("card.localTime", { time: localTime })}
              </dd>
            </div>
          )}
          {birthdaySoon && member.birthday_month && member.birthday_day && (
            <div className="flex items-center gap-1.5">
              <Cake className="h-3 w-3 shrink-0" aria-hidden />
              <dt className="sr-only">{t("card.birthday")}</dt>
              <dd className="truncate">
                {birthdayIn === 0
                  ? t("card.birthdayToday")
                  : t("card.birthdayOn", { date: formatBirthday(member.birthday_month, member.birthday_day, locale) })}
              </dd>
            </div>
          )}
        </dl>
      )}

      {shown.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {shown.map((p) => (
            <PersonaChip key={p.id} persona={p} userId={member.user_id} />
          ))}
          {rest > 0 && (
            <span className="rounded-full px-2 py-0.5 text-xs text-muted-foreground">
              {t("morePersonas", { count: rest })}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs italic text-muted-foreground">{t("noPersona")}</p>
      )}
    </article>
  );
}
