"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { DEFAULT_CURRENCY_UNITS, currencyUnitsOf, type CurrencyUnit } from "@/lib/worldCurrency";

/** Un mouvement de bourse (`world_economy_ledger`, migration 246). */
export type WalletMovement = {
  id: string;
  delta: number;
  balance_after: number;
  kind: "adjust";
  note: string | null;
  created_at: string;
};

export type AdjustResult = { ok: true } | { ok: false; error: "insufficient" | "failed" };

/** Les derniers mouvements montrés sur la fiche. */
export const WALLET_LEDGER_LIMIT = 20;

/**
 * La bourse d'un persona : la monnaie de son monde, son solde, ses derniers
 * mouvements (que la base ne rend qu'à son joueur et à qui gère l'économie),
 * et l'ajustement manuel.
 *
 * `off` tant que le monde n'a pas l'économie active, ou sans monde : rien
 * d'autre n'est lu.
 */
export function usePersonaWallet(personaId: string | null, worldId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<"loading" | "off" | "on">(worldId && personaId ? "loading" : "off");
  const [units, setUnits] = useState<CurrencyUnit[]>(DEFAULT_CURRENCY_UNITS);
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<WalletMovement[]>([]);

  const loadLedger = useCallback(async () => {
    if (!personaId) return;
    const { data } = await supabase
      .from("world_economy_ledger")
      .select("id, delta, balance_after, kind, note, created_at")
      .eq("persona_id", personaId)
      .order("created_at", { ascending: false })
      .limit(WALLET_LEDGER_LIMIT);
    setLedger((data ?? []) as WalletMovement[]);
  }, [supabase, personaId]);

  useEffect(() => {
    if (!worldId || !personaId) {
      setStatus("off");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const { data: world } = await supabase
        .from("worlds")
        .select("enable_economy, currency_units")
        .eq("id", worldId)
        .maybeSingle();
      if (cancelled) return;
      const row = world as { enable_economy?: boolean | null; currency_units?: unknown } | null;
      if (!row?.enable_economy) {
        setStatus("off");
        return;
      }
      const [{ data: wallet }, { data: moves }] = await Promise.all([
        supabase.from("persona_wallets").select("balance").eq("persona_id", personaId).maybeSingle(),
        supabase
          .from("world_economy_ledger")
          .select("id, delta, balance_after, kind, note, created_at")
          .eq("persona_id", personaId)
          .order("created_at", { ascending: false })
          .limit(WALLET_LEDGER_LIMIT),
      ]);
      if (cancelled) return;
      setUnits(currencyUnitsOf(row.currency_units));
      setBalance(Number((wallet as { balance?: number | string } | null)?.balance ?? 0));
      setLedger((moves ?? []) as WalletMovement[]);
      setStatus("on");
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, personaId, worldId]);

  const adjust = useCallback(
    async (delta: number, note: string): Promise<AdjustResult> => {
      if (!personaId) return { ok: false, error: "failed" };
      const { data, error } = await supabase.rpc("adjust_persona_balance", {
        p_persona: personaId,
        p_delta: delta,
        p_note: note,
      });
      if (error) {
        return { ok: false, error: /insuffisant/i.test(error.message ?? "") ? "insufficient" : "failed" };
      }
      setBalance(Number(data));
      void loadLedger();
      return { ok: true };
    },
    [supabase, personaId, loadLedger],
  );

  return { status, units, balance, ledger, adjust };
}
