"use client";

/**
 * Boutons du rail des messages privés (icône, avatars épinglés) et leurs
 * petites primitives d'affichage.
 *
 * Séparés de `index.tsx` : le rail est affiché sur toutes les pages, alors que
 * le panneau des conversations ne se charge qu'à l'ouverture (`dynamic()` dans
 * AppShell). Tant que le rail importait ses boutons depuis `index.tsx`, tout le
 * panneau entrait quand même dans le JavaScript de chaque page.
 */

import { StoredImage } from "@/components/ui/stored-image";
import { avatarThumbWidth } from "@/lib/storage";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRESENCE_BG } from "@/components/avatars/PresenceDot";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CountPip } from "@/components/ui/count-pip";
import { useDms } from "@/components/providers/DmsProvider";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { useTranslations } from "next-intl";
import type { DmConversation } from "@/types/db";

// ── Shared primitives ─────────────────────────────────────────────────────────

export function DmAvatar({
  src,
  fallback,
  size,
  className,
  isActive = false,
}: {
  src?: string | null;
  fallback: string;
  size: number;
  className?: string;
  isActive?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground",
        isActive && "ring-2 ring-accent ring-offset-2 ring-offset-background",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {src
        // L'URL brute : c'est `StoredImage` qui décide des tailles demandées.
        ? <StoredImage
            url={src}
            width={avatarThumbWidth(size)}
            height={avatarThumbWidth(size)}
            resize="cover"
            className="object-cover"
          />
        : (fallback[0] ?? "?").toUpperCase()
      }
    </span>
  );
}

export function PresenceDot({
  status,
  size = "md",
}: {
  status: "online" | "away" | "offline";
  size?: "sm" | "md";
}) {
  if (status === "offline") return null;
  return (
    <span
      className={cn(
        "absolute rounded-full border-2 border-background",
        size === "sm" ? "bottom-0 right-0 h-2.5 w-2.5" : "bottom-0 right-0 h-3 w-3",
        PRESENCE_BG[status],
      )}
    />
  );
}

export function UnreadBadge({ count, offset = "default" }: { count: number; offset?: "default" | "tight" }) {
  return (
    <CountPip
      count={count}
      max={9}
      className={cn("absolute", offset === "tight" ? "-right-0.5 -top-0.5" : "-right-1 -top-1")}
    />
  );
}

// ── 1. Toggle button — icône dans le rail de la sidebar ───────────────────────

export function DmsToggleButton() {
  const t = useTranslations("dms");
  const { panelOpen, togglePanel, conversations, pinnedConvIds } = useDms();

  const unpinnedUnread = conversations
    .filter(c => !pinnedConvIds.includes(c.id))
    .reduce((sum, c) => sum + (c.unread_count ?? 0), 0);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePanel}
          aria-label={t("title")}
          aria-pressed={panelOpen}
          className="relative"
        >
          <Mail size={17} />
          {unpinnedUnread > 0 && (
            <UnreadBadge count={unpinnedUnread} offset="tight" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>{t("title")}</TooltipContent>
    </Tooltip>
  );
}

// ── 2. Pinned avatars — s'insère dans le rail de la sidebar ──────────────────

export function PinnedDmAvatarsRail() {
  const t = useTranslations("dms");
  const { conversations, pinnedConvIds, panelOpen, activeConvId, openConversation } = useDms();
  const { getUserPresence } = useGlobalPresence();

  const pinned = pinnedConvIds
    .map(id => conversations.find(c => c.id === id))
    .filter((c): c is DmConversation => !!c);

  if (pinned.length === 0) return null;

  return (
    <>
      {pinned.map((conv) => {
        const presence = getUserPresence(conv.other_user_id);
        const label = conv.other_username ? `@${conv.other_username}` : t("privateMessage");
        const isActive = panelOpen && activeConvId === conv.id;

        return (
          <Tooltip key={conv.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => void openConversation(conv.other_user_id)}
                aria-label={label}
                aria-pressed={isActive}
                className={cn(
                  "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                )}
              >
                <DmAvatar src={conv.other_avatar_url} fallback={conv.other_username ?? "?"} size={36} isActive={isActive} />
                <PresenceDot status={presence} size="sm" />
                <UnreadBadge count={conv.unread_count} offset="tight" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}
