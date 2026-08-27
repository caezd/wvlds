"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Drawer,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SideSheetContent } from "@/components/ui/side-sheet";
import { Coins, Flame, Zap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PresenceDot } from "@/components/avatars/PresenceDot";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { formatLastSeen } from "@/lib/utils";
import { isPronounOption } from "@/lib/pronouns";
import { levelInfo } from "@/lib/xp";

function formatMemberSince(value: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function initials(name: string) {
  return (name.trim()[0] ?? "?").toUpperCase();
}

type ProfileData = {
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  pronouns: string[] | null;
  created_at: string | null;
  last_seen_at: string | null;
  appear_offline: boolean;
};

type BalanceSummary = {
  xp: number;
  coins: number;
  streak_current: number;
};

export function UserProfileSheetTrigger({
  children,
  userId,
  label,
}: {
  children: React.ReactNode;
  userId?: string | null;
  label?: string | null;
}) {
  const t = useTranslations("userProfile");
  const tPronouns = useTranslations("pronouns");
  const supabase = React.useMemo(() => createClient(), []);
  const { getUserPresence } = useGlobalPresence();
  const [open, setOpen] = React.useState(false);
  const [profile, setProfile] = React.useState<ProfileData | null>(null);
  const [balance, setBalance] = React.useState<BalanceSummary | null>(null);
  const [loading, setLoading] = React.useState(false);

  const fetchedKeyRef = React.useRef<string | null>(null);

  const prefetch = React.useCallback(() => {
    if (!userId || fetchedKeyRef.current === userId) return;
    fetchedKeyRef.current = userId;
    setLoading(true);

    async function load() {
      const [{ data, error }, { data: bal }] = await Promise.all([
        supabase
          .from("profiles")
          .select("username,avatar_url,bio,pronouns,created_at,last_seen_at,appear_offline")
          .eq("id", userId!)
          .maybeSingle(),
        // RPC (pas une lecture directe de gamification_balances) : nécessaire
        // pour consulter le solde d'un AUTRE utilisateur, la RLS de la table
        // ne laissant lire que sa propre ligne.
        supabase.rpc("get_balance_summary", { p_user_id: userId! }),
      ]);

      setLoading(false);
      if (error) {
        toast.error(error.message ?? "Impossible de charger le profil.");
        fetchedKeyRef.current = null;
        return;
      }
      if (data) setProfile(data as unknown as ProfileData);
      const balRow = Array.isArray(bal) ? bal?.[0] : bal;
      if (balRow) {
        setBalance({
          xp: Number(balRow.xp) || 0,
          coins: Number(balRow.coins) || 0,
          streak_current: Number(balRow.streak_current) || 0,
        });
      }
    }

    void load();
  }, [userId, supabase]);

  React.useEffect(() => {
    if (open) prefetch();
  }, [open, prefetch]);

  const xpInfo = balance ? levelInfo(balance.xp) : null;
  const username = profile?.username ?? label ?? null;
  const userPresence = userId ? getUserPresence(userId) : "offline";
  const presenceLine =
    userPresence === "online"
      ? "En ligne"
      : userPresence === "away"
        ? "Absent"
        : profile?.appear_offline
          ? "Hors ligne"
          : profile?.last_seen_at
            ? `Vu ${formatLastSeen(profile.last_seen_at)}`
            : null;

  return (
    <Drawer open={open} onOpenChange={setOpen} swipeDirection="right">
      <button
        type="button"
        title={label ?? t("title")}
        aria-label={label ?? t("title")}
        onPointerEnter={prefetch}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>

      <SideSheetContent width="compact">
        <DrawerHeader className="sr-only">
          <DrawerTitle>{username ?? t("title")}</DrawerTitle>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto flex flex-col items-center gap-3 pt-2 text-center">
          <Avatar className="size-20">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
            <AvatarFallback className="text-2xl">
              {initials(username ?? "?")}
            </AvatarFallback>
          </Avatar>

          <div>
            <p className="text-base font-semibold">{username ?? "—"}</p>
            {presenceLine && (
              <p className="mt-0.5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <PresenceDot state={userPresence} />
                {presenceLine}
              </p>
            )}
          </div>

          {xpInfo && balance && (
            <div className="w-full space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Niveau {xpInfo.level}</span>
                <span>{balance.xp} / {xpInfo.xpForNext} XP</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${xpInfo.progress}%` }}
                />
              </div>
              <div className="flex items-center justify-center gap-3 pt-0.5 text-xs">
                <span className="flex items-center gap-1 text-yellow-400">
                  <Coins className="h-3.5 w-3.5" />
                  {balance.coins.toLocaleString()}
                </span>
                <span className="flex items-center gap-1 text-orange-400">
                  <Flame className="h-3.5 w-3.5" />
                  {balance.streak_current} j.
                </span>
                <span className="flex items-center gap-1 text-blue-400">
                  <Zap className="h-3.5 w-3.5" />
                  {balance.xp} XP
                </span>
              </div>
            </div>
          )}

          {!!profile?.pronouns?.length && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {profile.pronouns.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-border-soft bg-muted/40 px-2.5 py-0.5 text-xs font-medium"
                >
                  {isPronounOption(p) ? tPronouns(p) : p}
                </span>
              ))}
            </div>
          )}

          {profile?.bio && (
            <div className="w-full rounded-lg border border-border-soft bg-muted/30 p-3 text-left">
              <MarkdownRenderer content={profile.bio} className="text-sm prose-sm" />
            </div>
          )}

          {profile?.created_at && (
            <p className="text-xs text-muted-foreground">
              {t("memberSince", { date: formatMemberSince(profile.created_at) })}
            </p>
          )}

          {loading && !profile && (
            <div className="w-full space-y-2 pt-2">
              <div className="mx-auto h-3 w-32 animate-pulse rounded bg-muted" />
              <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
            </div>
          )}
        </div>
      </SideSheetContent>
    </Drawer>
  );
}
