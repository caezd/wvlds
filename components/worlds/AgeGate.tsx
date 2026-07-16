"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShieldAlert, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AgeVerificationFields } from "./AgeVerificationFields";

/**
 * Barrière plein écran affichée à la place du monde tant que le membre
 * courant n'a pas confirmé être majeur (worlds.is_age_restricted = true et
 * world_members.age_confirmed_at IS NULL) — première visite après avoir
 * rejoint, ou membre déjà présent quand le monde devient 18+.
 */
export function AgeGate({ worldId, worldName }: { worldId: string; worldName: string }) {
  const router = useRouter();
  const t = useTranslations("explore");
  const tCommon = useTranslations("common");
  const [confirming, setConfirming] = useState(false);
  const [adult, setAdult] = useState(false);

  async function confirm() {
    if (!adult) return;
    setConfirming(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("confirm_world_age", { p_world_id: worldId });
    setConfirming(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <main className="flex h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border-soft bg-card p-6 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1.5 text-center">
          <h2 className="text-base font-semibold">{t("ageConfirmTitle")}</h2>
          <p className="text-sm text-muted-foreground leading-snug">
            {t("ageConfirmDescription", { name: worldName })}
          </p>
        </div>
        <AgeVerificationFields onAdultChange={setAdult} disabled={confirming} />
        <div className="flex flex-col gap-2 pt-1">
          <Button onClick={() => void confirm()} disabled={confirming || !adult}>
            {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
            {tCommon("confirm")}
          </Button>
          <Button variant="ghost" onClick={() => router.push("/p")} disabled={confirming}>
            {tCommon("back")}
          </Button>
        </div>
      </div>
    </main>
  );
}
