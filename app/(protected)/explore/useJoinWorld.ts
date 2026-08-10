"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { joinPublicWorld } from "./actions";

export function useJoinWorld(worldId: string) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function join(ageConfirmed: boolean) {
    startTransition(async () => {
      const { error } = await joinPublicWorld(worldId, ageConfirmed);
      if (!error) {
        // `join` est appelé depuis la confirmation d'âge (AlertDialog) ou
        // depuis WorldStatsDialog, qui n'a pas forcément fini de se fermer.
        // Radix retire le lock `pointer-events: none` posé sur <body>
        // pendant l'animation de fermeture, mais celle-ci n'a pas le temps
        // de se terminer avant que la navigation ne démonte l'arbre — le
        // DOM reste alors figé (page bloquée jusqu'au rafraîchissement).
        // On force donc le nettoyage nous-mêmes avant de naviguer (même
        // technique que WorldPickerHeader.confirmLeave).
        document.body.style.pointerEvents = "";
        router.push(`/w/${worldId}`);
      } else {
        toast.error(error);
      }
    });
  }

  return { join, isPending };
}
