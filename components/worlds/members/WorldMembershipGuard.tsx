"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onMembershipChange } from "@/lib/membershipEvents";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

/**
 * Garde de membership : si l'utilisateur courant est retiré du monde, il est
 * redirigé vers ses personnages.
 *
 * L'avis de retrait arrive sur son canal personnel privé (migration 208),
 * relayé par NotificationsProvider (lib/membershipEvents). Avant, ce garde
 * écoutait TOUTES les suppressions de `world_members` — les DELETE ne passant
 * pas par la policy de lecture, chaque utilisateur connecté apprenait chaque
 * retrait de membre, de tous les mondes.
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

  useEffect(() => {
    if (!worldId || !selfId) return;
    return onMembershipChange(({ worldId: wid, change }) => {
      if (change !== "removed" || wid !== worldId) return;
      toast.info(t("removedFromWorld"));
      router.replace("/p");
      router.refresh();
    });
  }, [worldId, selfId, router, t]);

  return null;
}
