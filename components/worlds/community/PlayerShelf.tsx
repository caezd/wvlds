"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { getLeadingLetter } from "@/lib/textFormatting";
import { daysUntilBirthday, formatBirthday, localTimeIn, relativeTime } from "@/lib/relativeTime";
import type { WorldMemberActivity } from "@/lib/worldMembers";
import { ChatroomAvatarWithPresence } from "@/components/chatrooms/persona/ChatroomAvatarWithPresence";
import { UserProfileSheetTrigger } from "@/components/profile/UserProfileSheetTrigger";
import {
  BIRTHDAY_WINDOW_DAYS,
  MemberStatusBadge,
  displayNameOf,
  type PresenceState,
  type WorldMemberCardData,
} from "@/components/worlds/members/WorldMemberCard";

/** La grille d'une étagère : tous les personas, sur autant de lignes qu'il faut. */
const SHELF_GRID = "grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]";

/** Un bouton de l'en-tête (« Profil », « Écrire ») : ce ne sont pas des actions, donc un `ghost`. */
export const SHELF_ACTION_CLASS = cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs");

/**
 * Une étagère de la vue « Joueurs » : l'en-tête du joueur, puis la grille de
 * tous ses personas. Ni carte, ni fond, ni bordure : l'espace sépare les étagères.
 */
export function PlayerShelf({ header, children, footer }: { header: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <article className="flex flex-col gap-4">
      {header}
      <div className={SHELF_GRID}>{children}</div>
      {footer}
    </article>
  );
}

/**
 * L'en-tête d'une étagère : l'avatar, le nom et ses puces sur une ligne, un
 * résumé sur la ligne suivante, les actions à droite (dessous sur mobile).
 */
export function ShelfHeader({
  avatar,
  title,
  chips,
  line,
  actions,
}: {
  avatar: ReactNode;
  title: ReactNode;
  chips?: ReactNode;
  line?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3.5">
      {avatar}
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-semibold text-foreground">{title}</h3>
          {chips}
        </div>
        {line && <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">{line}</div>}
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}

/**
 * L'en-tête du joueur : avatar carré avec sa présence, pseudo, rôles (puces
 * neutres, la couleur en pastille), statut, puis une ligne qui assemble
 * l'activité, l'heure locale et l'anniversaire — la pastille dit la présence. La présentation
 * reste dans le profil.
 */
export function PlayerShelfHeader({
  member,
  presence,
  activity,
  actions,
  title,
  now = new Date(),
}: {
  member: WorldMemberCardData;
  presence: PresenceState;
  /** `undefined` : pas encore chargée. */
  activity?: WorldMemberActivity;
  actions?: ReactNode;
  /** Le nom affiché (« Moi · @pseudo ») ; le pseudo à défaut. */
  title?: ReactNode;
  /** Injectable pour les tests (heure locale, anniversaire). */
  now?: Date;
}) {
  const t = useTranslations("worlds.members");
  const tc = useTranslations("worlds.community");
  const tPresence = useTranslations("presence");
  const locale = useLocale();
  const displayName = displayNameOf(member);
  const away = member.effectiveStatus !== "active";

  const localTime = member.timezone ? localTimeIn(member.timezone, locale, now) : null;
  const birthdayIn =
    member.birthday_month && member.birthday_day ? daysUntilBirthday(member.birthday_month, member.birthday_day, now) : null;
  const birthday =
    birthdayIn !== null && birthdayIn <= BIRTHDAY_WINDOW_DAYS && member.birthday_month && member.birthday_day
      ? birthdayIn === 0
        ? t("card.birthdayToday")
        : t("card.birthdayOn", { date: formatBirthday(member.birthday_month, member.birthday_day, locale) })
      : null;
  const summary = [
    activity?.last_message_at && t("card.lastActive", { when: relativeTime(activity.last_message_at, locale, t("card.justNow"), now.getTime()) }),
    localTime && t("card.localTime", { time: localTime }),
    birthday,
  ].filter(Boolean).join(" · ");

  const hasRoles = member.isOwner || member.roles.length > 0;

  return (
    <div data-presence={presence} data-status={member.effectiveStatus}>
      <ShelfHeader
        avatar={
          <UserProfileSheetTrigger userId={member.user_id} label={t("openProfile", { name: displayName })}>
            {/* La pastille suffit à dire la présence ; le mot reste pour les lecteurs d'écran. */}
            <span className="block" title={tPresence(presence)}>
              <ChatroomAvatarWithPresence
                url={member.avatar_url}
                alt=""
                fallback={getLeadingLetter(displayName)}
                presenceState={presence}
                size={44}
                className={cn("text-sm", away && "brightness-75 grayscale")}
              />
              <span className="sr-only">{tPresence(presence)}</span>
            </span>
          </UserProfileSheetTrigger>
        }
        title={title ?? displayName}
        chips={
          <MemberStatusBadge
            status={member.effectiveStatus}
            until={member.status_until}
            note={member.status_note}
          />
        }
        line={
          (hasRoles || summary) && (
            <>
              {hasRoles && (
                <ul aria-label={t("rolesLabel")} className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {member.isOwner && (
                    <li className="flex max-w-full">
                      <Badge>
                        <BadgeDot className="bg-warning" />
                        {tc("shelf.owner")}
                      </Badge>
                    </li>
                  )}
                  {member.roles.map((r) => (
                    <li key={r.id} className="flex max-w-full">
                      <Badge>
                        <BadgeDot color={r.color} />
                        <span className="truncate">{r.name}</span>
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              {summary && <span className="truncate">{summary}</span>}
            </>
          )
        }
        actions={actions}
      />
    </div>
  );
}
