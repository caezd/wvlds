"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useJoinWorld } from "./useJoinWorld";
import { AgeConfirmDialog } from "@/components/worlds/AgeConfirmDialog";

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
      <button
        onClick={handleJoin}
        disabled={isPending}
        className={
          compact
            ? "shrink-0 rounded-lg border border-primary bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            : "w-full rounded-xl border border-primary bg-primary/10 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
        }
      >
        {isPending ? t("joining") : t("join")}
      </button>

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
