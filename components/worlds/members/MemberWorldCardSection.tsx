"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Cake, CalendarClock, Globe2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { MEMBER_CARD_COLUMNS, effectiveStatus, type WorldMemberCardFields } from "@/lib/worldMembers";
import { formatBirthday, localTimeIn } from "@/lib/relativeTime";
import { useCurrentWorldId } from "@/hooks/useMyWorldCard";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { MemberStatusBadge } from "./WorldMemberCard";

/**
 * La carte d'un membre dans le monde où l'on se trouve, sur son profil :
 * statut de joueur, présentation propre au monde, disponibilités et heure
 * locale, anniversaire. Rien hors d'un monde, ni pour qui n'en est pas membre.
 */
export function MemberWorldCardSection({ userId, className }: { userId: string; className?: string }) {
  const t = useTranslations("worlds.members.card");
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const worldId = useCurrentWorldId();
  const [state, setState] = useState<{ worldId: string; card: WorldMemberCardFields | null; worldName: string | null } | null>(null);

  useEffect(() => {
    if (!worldId) { setState(null); return; }
    let cancelled = false;
    (async () => {
      const [{ data: member }, { data: world }] = await Promise.all([
        supabase.from(TABLE.WORLD_MEMBERS).select(MEMBER_CARD_COLUMNS).eq("world_id", worldId).eq("user_id", userId).maybeSingle(),
        supabase.from(TABLE.WORLDS).select("name").eq("id", worldId).maybeSingle(),
      ]);
      if (cancelled) return;
      setState({ worldId, card: (member as WorldMemberCardFields | null) ?? null, worldName: (world as { name: string | null } | null)?.name ?? null });
    })();
    return () => { cancelled = true; };
  }, [supabase, worldId, userId]);

  if (!worldId || state?.worldId !== worldId || !state.card) return null;
  const card = state.card;
  const status = effectiveStatus(card);
  const localTime = card.timezone ? localTimeIn(card.timezone, locale) : null;
  const hasBirthday = !!card.birthday_month && !!card.birthday_day;
  const empty = status === "active" && !card.bio && !card.availability && !localTime && !hasBirthday;
  if (empty) return null;

  return (
    <section className={className} data-testid="member-world-card">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Globe2 className="h-3.5 w-3.5" aria-hidden />
        {state.worldName ? t("inWorld", { world: state.worldName }) : t("inThisWorld")}
      </h3>
      <div className="space-y-2 rounded-lg border border-border-soft bg-muted/30 p-3 text-left">
        {status !== "active" && <MemberStatusBadge status={status} until={card.status_until} note={card.status_note} />}
        {card.bio && <MarkdownRenderer content={card.bio} className="text-sm prose-sm" />}
        {(card.availability || localTime || hasBirthday) && (
          <dl className="space-y-1 text-xs text-muted-foreground">
            {(card.availability || localTime) && (
              <div className="flex items-center gap-1.5">
                <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
                <dt className="sr-only">{t("availability")}</dt>
                <dd className="truncate">
                  {card.availability}
                  {card.availability && localTime && " · "}
                  {localTime && t("localTime", { time: localTime })}
                </dd>
              </div>
            )}
            {hasBirthday && (
              <div className="flex items-center gap-1.5">
                <Cake className="h-3 w-3 shrink-0" aria-hidden />
                <dt className="sr-only">{t("birthday")}</dt>
                <dd className="truncate">{t("birthdayOn", { date: formatBirthday(card.birthday_month!, card.birthday_day!, locale) })}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </section>
  );
}
