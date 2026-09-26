"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Cake } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { loadBirthdayMembers, type BirthdayMember } from "./widgetData";
export type { BirthdayMember };
import { daysUntilBirthday, formatBirthday } from "@/lib/relativeTime";
import { getLeadingLetter } from "@/lib/textFormatting";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";



const DEFAULT_DAYS = 30;

/** Les anniversaires du monde dans la fenêtre : aujourd'hui d'abord, puis les prochains. */
export function upcomingBirthdays<T extends { birthday_month: number; birthday_day: number; username?: string | null }>(
  members: T[],
  days: number,
  now: Date = new Date(),
): (T & { inDays: number })[] {
  return members
    .map((m) => ({ ...m, inDays: daysUntilBirthday(m.birthday_month, m.birthday_day, now) }))
    .filter((m) => m.inDays <= days)
    .sort((a, b) => a.inDays - b.inDays || (a.username ?? "").localeCompare(b.username ?? ""));
}

/**
 * Bloc d'accueil « Anniversaires » : les membres dont l'anniversaire tombe
 * dans les `days` prochains jours (réglage du bloc), avec la date.
 */
export function WorldBirthdaysWidget({
  worldId,
  days = DEFAULT_DAYS,
  initialMembers,
  now,
}: {
  worldId: string;
  days?: number;
  /** Données résolues côté serveur ; `undefined` : le widget charge au montage. */
  initialMembers?: BirthdayMember[];
  /** Injectable pour les tests. */
  now?: Date;
}) {
  const t = useTranslations("worlds.home.birthdays");
  const locale = useLocale();
  const [members, setMembers] = useState<BirthdayMember[]>(initialMembers ?? []);

  useEffect(() => {
    if (initialMembers !== undefined) return;
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const rows = await loadBirthdayMembers(supabase, worldId);
      if (!cancelled) setMembers(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [worldId, initialMembers]);

  const upcoming = useMemo(() => upcomingBirthdays(members, days, now), [members, days, now]);

  return (
    <div className="rounded-lg border">
      <div className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground">
        <Cake className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{t("title")}</span>
      </div>
      {upcoming.length === 0 ? (
        <p className="border-t border-border-soft px-4 py-3 text-xs text-muted-foreground">{t("none", { days })}</p>
      ) : (
        <ul className="border-t border-border-soft py-1">
          {upcoming.map((m) => {
            const name = m.username ? `@${m.username}` : m.user_id.slice(0, 8);
            return (
              <li key={m.user_id} className="flex items-center gap-2.5 px-4 py-1.5 text-sm">
                <Avatar className="size-6 rounded-full">
                  <AvatarImage src={m.avatar_url ?? undefined} alt="" className="rounded-full" />
                  <AvatarFallback className="rounded-full text-[10px]">{getLeadingLetter(name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {m.inDays === 0 ? t("today") : formatBirthday(m.birthday_month, m.birthday_day, locale)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
