"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PresenceDot } from "@/components/avatars/PresenceDot";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { formatLastSeen } from "@/lib/utils";
import { isPronounOption } from "@/lib/pronouns";

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

function toSwipeDirection(side: "left" | "right" | "top" | "bottom"): "left" | "right" | "up" | "down" {
  if (side === "top") return "up";
  if (side === "bottom") return "down";
  return side;
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

export function UserProfileSheetTrigger({
  children,
  userId,
  label,
  side = "right",
}: {
  children: React.ReactNode;
  userId?: string | null;
  label?: string | null;
  side?: "left" | "right" | "top" | "bottom";
}) {
  const t = useTranslations("userProfile");
  const tPronouns = useTranslations("pronouns");
  const tCommon = useTranslations("common");
  const supabase = React.useMemo(() => createClient(), []);
  const { getUserPresence } = useGlobalPresence();
  const [open, setOpen] = React.useState(false);
  const [profile, setProfile] = React.useState<ProfileData | null>(null);
  const [loading, setLoading] = React.useState(false);

  const fetchedKeyRef = React.useRef<string | null>(null);

  const prefetch = React.useCallback(() => {
    if (!userId || fetchedKeyRef.current === userId) return;
    fetchedKeyRef.current = userId;
    setLoading(true);

    async function load() {
      const { data, error } = await supabase
        .from("profiles")
        .select("username,avatar_url,bio,pronouns,created_at,last_seen_at,appear_offline")
        .eq("id", userId!)
        .maybeSingle();

      setLoading(false);
      if (error) {
        toast.error(error.message ?? "Impossible de charger le profil.");
        fetchedKeyRef.current = null;
        return;
      }
      if (data) setProfile(data as unknown as ProfileData);
    }

    void load();
  }, [userId, supabase]);

  React.useEffect(() => {
    if (open) prefetch();
  }, [open, prefetch]);

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
    <Drawer open={open} onOpenChange={setOpen} swipeDirection={toSwipeDirection(side)}>
      <button
        type="button"
        title={label ?? t("title")}
        aria-label={label ?? t("title")}
        onPointerEnter={prefetch}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>

      <DrawerContent className="inset-y-0 right-0 flex flex-col gap-0 border rounded-md bg-background text-foreground shadow-lg p-0 w-[min(calc(100%_-_var(--drawer-inset)*2),_384px)]">
        <DrawerClose
          aria-label={tCommon("close")}
          className="absolute right-4 top-4 rounded-xs text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="size-4" />
        </DrawerClose>
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
      </DrawerContent>
    </Drawer>
  );
}
