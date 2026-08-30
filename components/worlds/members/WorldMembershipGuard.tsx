"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

/**
 * Garde de membership : si l'utilisateur courant est retiré du monde
 * (DELETE sur world_members), il est redirigé vers ses personnages.
 *
 * Note : les événements DELETE realtime ne portent que la clé primaire
 * (world_id, user_id) et ne sont pas filtrés par RLS — c'est voulu ici,
 * l'utilisateur retiré doit recevoir l'événement alors qu'il a déjà
 * perdu l'accès en lecture.
 */
export function WorldMembershipGuard({
  worldId,
  selfId,
}: {
  worldId: string | null;
  selfId: string | null;
}) {
  const t = useTranslations("worlds");
  const router = useRouter();
  const reconnectEpoch = useReconnectEpoch();

  useEffect(() => {
    if (!worldId || !selfId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`membership-guard:${worldId}:${selfId}`)
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "world_members" },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const old = payload.old as {
            world_id?: string;
            user_id?: string;
          } | null;
          if (old?.world_id === worldId && old?.user_id === selfId) {
            toast.info(t("removedFromWorld"));
            router.replace("/p");
            router.refresh();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [worldId, selfId, router, reconnectEpoch, t]);

  return null;
}
