"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShieldAlert, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMyBirthDate } from "@/hooks/useMyBirthDate";
import { AgeVerificationFields } from "./AgeVerificationFields";

/**
 * Barrière plein écran affichée à la place du monde tant que le membre
 * courant n'a pas confirmé être majeur (worlds.is_age_restricted = true et
 * world_members.age_confirmed_at IS NULL) — première visite après avoir
 * rejoint, ou membre déjà présent quand le monde devient 18+.
 *
 * Avec la date de naissance du compte (migration 266) : un majeur entre sans
 * rien saisir, un mineur est arrêté ; sans date, elle est demandée et la
 * confirmation l'enregistre.
 */
export function AgeGate({ worldId, worldName }: { worldId: string; worldName: string }) {
  const router = useRouter();
  const t = useTranslations("explore");
  const tCommon = useTranslations("common");
  const known = useMyBirthDate();
  const [confirming, setConfirming] = useState(false);
  const [birthDate, setBirthDate] = useState<string | null>(null);

  const confirm = useCallback(
    async (date: string | null) => {
      setConfirming(true);
      const { error } = await createClient().rpc(
        "confirm_world_age",
        date ? { p_world_id: worldId, p_birth_date: date } : { p_world_id: worldId },
      );
      setConfirming(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      router.refresh();
    },
    [worldId, router],
  );

  // Majeur connu : la date du compte suffit.
  const autoConfirmed = useRef(false);
  useEffect(() => {
    if (known.status !== "adult" || autoConfirmed.current) return;
    autoConfirmed.current = true;
    void confirm(null);
  }, [known.status, confirm]);

  const waiting = known.status === "loading" || known.status === "adult";
  const minor = known.status === "minor";

  return (
    <main className="flex h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          {waiting ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <ShieldAlert className="h-6 w-6 text-destructive" />
          )}
        </div>
        <div className="space-y-1.5 text-center">
          <h2 className="text-base font-semibold">{t("ageConfirmTitle")}</h2>
          <p className="text-sm text-muted-foreground leading-snug">
            {minor ? t("ageRestrictedUnderage") : t("ageConfirmDescription", { name: worldName })}
          </p>
        </div>
        {!waiting && !minor && <AgeVerificationFields onBirthDateChange={setBirthDate} disabled={confirming} />}
        <div className="flex flex-col gap-2 pt-1">
          {!waiting && !minor && (
            <Button onClick={() => void confirm(birthDate)} disabled={confirming || !birthDate}>
              {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
              {tCommon("confirm")}
            </Button>
          )}
          <Button variant="ghost" onClick={() => router.push("/p")} disabled={confirming}>
            {tCommon("back")}
          </Button>
        </div>
      </div>
    </main>
  );
}
