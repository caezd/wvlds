"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useJoinWorld } from "./useJoinWorld";
import { AgeConfirmDialog } from "@/components/worlds/AgeConfirmDialog";
import { Button } from "@/components/ui/button";

export function JoinWorldButton({
  worldId,
  worldName,
  ageRestricted = false,
  compact = false,
  onRequestAgeConfirm,
}: {
  worldId: string;
  worldName: string;
  ageRestricted?: boolean;
  compact?: boolean;
  /** Si fourni, délègue la confirmation d'âge au parent au lieu d'afficher
   * son propre dialog — indispensable quand ce bouton vit à l'intérieur d'un
   * autre Dialog Radix (le fermer démonterait sinon notre propre dialog
   * avant qu'il ait pu s'afficher). Voir WorldStatsDialog. */
  onRequestAgeConfirm?: () => void;
}) {
  const t = useTranslations("explore");
  const { join, isPending } = useJoinWorld(worldId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleJoin() {
    if (ageRestricted) {
      if (onRequestAgeConfirm) {
        onRequestAgeConfirm();
        return;
      }
      setConfirmOpen(true);
      return;
    }
    join(false);
  }

  return (
    <>
      <Button
        onClick={handleJoin}
        disabled={isPending}
        size="sm"
        className={compact ? "h-7 shrink-0 px-2.5 text-xs" : "w-full"}
      >
        {isPending ? t("joining") : t("join")}
      </Button>

      {ageRestricted && !onRequestAgeConfirm && (
        <AgeConfirmDialog
          worldName={worldName}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={() => {
            setConfirmOpen(false);
            join(true);
          }}
        />
      )}
    </>
  );
}
