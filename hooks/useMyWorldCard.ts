"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { MEMBER_CARD_COLUMNS, type WorldMemberCardFields } from "@/lib/worldMembers";
import { useCurrentWorldId } from "@/hooks/useCurrentWorldId";

export type MyWorldCard = {
  worldId: string;
  worldName: string | null;
  card: WorldMemberCardFields;
  /** Reporte une écriture réussie ; sans effet si l'on a changé de monde entre-temps. */
  patch: (fields: Partial<WorldMemberCardFields>) => void;
};

type Member = { worldId: string; worldName: string | null; card: WorldMemberCardFields | null };

/**
 * Ma carte dans le monde où l'on se trouve (présentation, disponibilités,
 * fuseau, anniversaire, statut), lue quand le monde change ; `null` hors d'un
 * monde ou si l'on n'en est pas membre. « Mon profil » vit hors du fournisseur
 * d'appartenance : le monde vient de l'adresse.
 */
export function useMyWorldCard(userId: string): MyWorldCard | null {
  const supabase = useMemo(() => createClient(), []);
  const worldId = useCurrentWorldId();
  const [member, setMember] = useState<Member | null>(null);

  useEffect(() => {
    if (!worldId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from(TABLE.WORLD_MEMBERS)
        .select(`${MEMBER_CARD_COLUMNS}, world:worlds(name)`)
        .eq("world_id", worldId)
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) console.error("[useMyWorldCard] lecture de la carte", error);
      // Le nom du monde vient avec la carte (jointure), pour l'onglet « Ma carte ».
      const row = data as (WorldMemberCardFields & { world?: { name: string | null } | null }) | null;
      const { world, ...card } = row ?? { world: null };
      setMember({ worldId, worldName: world?.name ?? null, card: row ? (card as WorldMemberCardFields) : null });
    })();
    return () => { cancelled = true; };
  }, [supabase, worldId, userId]);

  // Un objet stable tant que la carte ne change pas : les brouillons s'y comparent.
  return useMemo(() => {
    if (!worldId || member?.worldId !== worldId || !member.card) return null;
    return {
      worldId,
      worldName: member.worldName,
      card: member.card,
      // Fonctionnel et lié au monde : une écriture qui aboutit après un
      // changement de monde n'écrase pas la carte du monde suivant.
      patch: (fields) =>
        setMember((m) => (m?.worldId === worldId && m.card ? { ...m, card: { ...m.card, ...fields } } : m)),
    };
  }, [worldId, member]);
}
