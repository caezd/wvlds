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
        router.push(`/w/${worldId}`);
      } else {
        toast.error(error);
      }
    });
  }

  return { join, isPending };
}
