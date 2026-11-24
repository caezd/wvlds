"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { currencyUnitsOf, formatAmount } from "@/lib/worldCurrency";

/** Le jour (UTC) déjà réclamé pour un monde, gardé par le navigateur. */
const storageKey = (worldId: string) => `daily-gain:${worldId}`;
const todayUtc = () => new Date().toISOString().slice(0, 10);

/**
 * Le gain de la première visite du jour (migration 252) : à l'entrée dans un
 * monde qui a les gains, demande à la base de créditer mes personas, et
 * annonce le total. Une demande par jour et par monde depuis ce navigateur ;
 * la base, elle, ne paie qu'une fois par persona et par jour. Ne rend rien.
 */
export function DailyGainClaim({ worldId, currencyUnits }: { worldId: string; currencyUnits: unknown }) {
  const t = useTranslations("gains");

  useEffect(() => {
    const day = todayUtc();
    try {
      if (localStorage.getItem(storageKey(worldId)) === day) return;
      localStorage.setItem(storageKey(worldId), day);
    } catch {
      // Stockage indisponible (navigation privée) : la base tranche seule.
    }
    // Pas d'annulation au démontage : sous StrictMode, le second passage
    // trouverait le jour déjà noté et l'annonce serait perdue.
    void createClient()
      .rpc("claim_daily_gain", { p_world: worldId })
      .then(({ data }: { data: unknown }) => {
        const total = Number(data ?? 0);
        if (total > 0) toast.success(t("daily", { amount: formatAmount(total, currencyUnitsOf(currencyUnits)) }));
      });
    // Les paliers ne changent pas le gain : seule l'entrée dans un monde compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  return null;
}
