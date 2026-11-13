"use client";

import { useTranslations } from "next-intl";

import type { WorldMemberCardFields } from "@/lib/worldMembers";
import type { CardDraft } from "@/lib/worldMemberCard";
import { WorldMemberCardForm } from "@/components/worlds/members/WorldMemberCardDialog";

/**
 * L'onglet « Ma carte » : la carte du monde courant, en formulaire contrôlé —
 * la barre d'enregistrement de la fiche l'écrit avec le reste.
 */
export function WorldCardTab({
  worldId,
  worldName,
  userId,
  initial,
  value,
  onChange,
}: {
  worldId: string;
  worldName: string | null;
  userId: string;
  initial: WorldMemberCardFields;
  value: CardDraft;
  onChange: (patch: Partial<CardDraft>) => void;
}) {
  const t = useTranslations("worlds.members.card");
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t.rich("intro", {
          world: worldName ?? t("thisWorld"),
          b: (chunks) => <span className="text-foreground">{chunks}</span>,
        })}
      </p>
      <WorldMemberCardForm worldId={worldId} userId={userId} mode="self" initial={initial} value={value} onChange={onChange} />
    </div>
  );
}
