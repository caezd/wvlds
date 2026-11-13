"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useNotifications } from "@/components/providers/NotificationsProvider";

/**
 * « Marquer comme lu » d'un monde, partagé par les menus du sélecteur de
 * mondes et du rail.
 *
 * `hasUnread` dit s'il y a quelque chose à lire : des messages ou des salons
 * neufs (le badge du monde) ou une notification du monde encore affichée.
 */
export function useMarkWorldRead() {
  const { worldUnread, notifications, markWorldRead } = useNotifications();
  const t = useTranslations("worlds");

  const worldsWithNotifs = useMemo(
    () => new Set(notifications.map((n) => n.world_id).filter((id): id is string => !!id)),
    [notifications],
  );

  const hasUnread = useCallback(
    (worldId: string) => (worldUnread[worldId] ?? 0) > 0 || worldsWithNotifs.has(worldId),
    [worldUnread, worldsWithNotifs],
  );

  const markRead = useCallback(
    async (world: { id: string; name: string }) => {
      const ok = await markWorldRead(world.id);
      if (!ok) toast.error(t("markReadError", { name: world.name }));
    },
    [markWorldRead, t],
  );

  return { hasUnread, markRead };
}
