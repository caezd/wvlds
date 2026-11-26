"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { DEFAULT_CURRENCY_UNITS, currencyUnitsOf, type CurrencyUnit } from "@/lib/worldCurrency";

/** Un mouvement de bourse (`world_economy_ledger`, migration 246). */
export type WalletMovement = {
  id: string;
  delta: number;
  balance_after: number;
  kind:
    | "adjust"
    | "slots"
    | "purchase"
    | "sale"
    | "transfer"
    | "gain_message"
    | "gain_scene_joined"
    | "gain_scene_created"
    | "gain_scene_completed"
    | "gain_daily_login"
    | "tax";
  note: string | null;
  created_at: string;
};

export type AdjustResult = { ok: true } | { ok: false; error: "insufficient" | "failed" };

/** Les mouvements montrés sur la fiche, puis à chaque « Voir plus ». */
export const WALLET_LEDGER_LIMIT = 20;

const LEDGER_SELECT = "id, delta, balance_after, kind, note, created_at";

/**
 * La bourse d'un persona : la monnaie de son monde, son solde, ses derniers
 * mouvements (que la base ne rend qu'à son joueur et à qui gère l'économie),
 * par pages (`loadMore`), et l'ajustement manuel.
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
  const [hasMore, setHasMore] = useState(false);
  // Le nombre de mouvements affichés : une relecture garde ce qui a été déplié.
  const shown = useRef(WALLET_LEDGER_LIMIT);

  /** Les mouvements de `from` à `to` (inclus), du plus récent au plus ancien. */
  const page = useCallback(
    async (from: number, to: number) => {
      const { data } = await supabase
        .from("world_economy_ledger")
        .select(LEDGER_SELECT)
        .eq("persona_id", personaId!)
        .order("created_at", { ascending: false })
        .range(from, to);
      return (data ?? []) as WalletMovement[];
    },
    [supabase, personaId],
  );

  const loadLedger = useCallback(async () => {
    if (!personaId) return;
    const rows = await page(0, shown.current - 1);
    setLedger(rows);
    setHasMore(rows.length === shown.current);
  }, [personaId, page]);

  /** La page suivante, à la suite ; un mouvement déjà là (liste décalée entre-temps) n'est pas doublé. */
  const loadMore = useCallback(async () => {
    if (!personaId) return;
    const from = ledger.length;
    const rows = await page(from, from + WALLET_LEDGER_LIMIT - 1);
    setLedger((current) => {
      const known = new Set(current.map((m) => m.id));
      const next = [...current, ...rows.filter((m) => !known.has(m.id))];
      shown.current = Math.max(WALLET_LEDGER_LIMIT, next.length);
      return next;
    });
    setHasMore(rows.length === WALLET_LEDGER_LIMIT);
  }, [personaId, page, ledger.length]);

  useEffect(() => {
    if (!worldId || !personaId) {
      setStatus("off");
      return;
    }
    let cancelled = false;
    shown.current = WALLET_LEDGER_LIMIT;
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
      const [{ data: wallet }, moves] = await Promise.all([
        supabase.from("persona_wallets").select("balance").eq("persona_id", personaId).maybeSingle(),
        page(0, WALLET_LEDGER_LIMIT - 1),
      ]);
      if (cancelled) return;
      setUnits(currencyUnitsOf(row.currency_units));
      setBalance(Number((wallet as { balance?: number | string } | null)?.balance ?? 0));
      setLedger(moves);
      setHasMore(moves.length === WALLET_LEDGER_LIMIT);
      setStatus("on");
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, personaId, worldId, page]);

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

  /** Relit solde et mouvements, quand la bourse a bougé ailleurs (achat d'emplacement). */
  const refresh = useCallback(async () => {
    if (!personaId) return;
    const [{ data: wallet }] = await Promise.all([
      supabase.from("persona_wallets").select("balance").eq("persona_id", personaId).maybeSingle(),
      loadLedger(),
    ]);
    setBalance(Number((wallet as { balance?: number | string } | null)?.balance ?? 0));
  }, [supabase, personaId, loadLedger]);

  return { status, units, balance, ledger, hasMore, loadMore, adjust, refresh };
}
