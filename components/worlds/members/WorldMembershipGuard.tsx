"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onMembershipChange } from "@/lib/membershipEvents";
import { isStillWorldMember } from "@/lib/membershipCheck";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

/**
 * Garde de membership : si l'utilisateur courant n'est plus membre du monde,
 * il est redirigé vers ses personnages.
 *
 * Deux voies :
 * - l'avis de retrait, en direct, sur son canal personnel privé (migration
 *   208), relayé par NotificationsProvider (lib/membershipEvents) ;
 * - une VÉRIFICATION au montage et à chaque reconnexion. Une page servie par
 *   le cache du routeur client (`staleTimes`, next.config.ts) ne repasse pas
 *   par les contrôles serveur : sans elle, quelqu'un retiré pendant son
 *   absence revoyait encore le salon ou le monde depuis le cache. Une réponse
 *   incertaine (coupure) ne renvoie personne.
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
    let renvoye = false;
    const renvoyer = () => {
      if (renvoye) return;
      renvoye = true;
      toast.info(t("removedFromWorld"));
      router.replace("/p");
      router.refresh();
    };

    let annule = false;
    void isStillWorldMember(createClient(), worldId, selfId).then((membre) => {
      if (!annule && membre === false) renvoyer();
    });

    const desabonner = onMembershipChange(({ worldId: wid, change }) => {
      if (change === "removed" && wid === worldId) renvoyer();
    });
    return () => {
      annule = true;
      desabonner();
    };
  }, [worldId, selfId, router, t, reconnectEpoch]);

  return null;
}
