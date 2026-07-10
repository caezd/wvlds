"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinPublicWorld } from "./actions";
import { useTranslations } from "next-intl";

export function JoinWorldButton({ worldId, compact = false }: { worldId: string; compact?: boolean }) {
  const t = useTranslations("explore");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleJoin() {
    startTransition(async () => {
      const { error } = await joinPublicWorld(worldId);
      if (!error) {
        router.push(`/w/${worldId}`);
      }
    });
  }

  return (
    <button
      onClick={handleJoin}
      disabled={isPending}
      className={
        compact
          ? "shrink-0 rounded-lg border border-primary bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          : "w-full rounded-xl border border-primary bg-primary/10 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
      }
    >
      {isPending ? t("joining") : t("join")}
    </button>
  );
}
