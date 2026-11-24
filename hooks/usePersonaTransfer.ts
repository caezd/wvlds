"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { DEFAULT_CURRENCY_UNITS, currencyUnitsOf, type CurrencyUnit } from "@/lib/worldCurrency";
import { canTradeWith, worldHasTrades, type TransferItemPick } from "@/lib/worldTrades";
import type { InventoryRow } from "@/hooks/usePersonaInventory";

/** Un persona du monde à qui donner. */
export type TransferRecipient = {
  id: string;
  name: string;
  avatar_url: string | null;
  user_id: string | null;
  is_npc: boolean;
};

export type TransferError = "funds" | "full" | "max" | "insufficient" | "sameAccount" | "off" | "failed";
export type TransferResult = { ok: true; id: string } | { ok: false; error: TransferError };

const ITEM_SELECT =
  "id, catalog_item_id, name, description, icon, lucide_icon, quantity, sort_index, " +
  "catalog:catalog_item_id(id, name, description, icon, lucide_icon, image_url, rarity, stackable, max_quantity, deleted_at)";

/** Au-delà, la liste des destinataires se cherche par nom. */
const MAX_RECIPIENTS = 500;

/** Les messages de la base (migrations 246, 247, 251), ramenés à ce que l'interface dit. */
function errorOf(error: { message?: string } | null): TransferError {
  const msg = error?.message ?? "";
  if (/solde insuffisant/i.test(msg)) return "funds";
  if (/inventaire plein/i.test(msg)) return "full";
  if (/quantité maximale/i.test(msg)) return "max";
  if (/insuffisant/i.test(msg)) return "insufficient";
  if (/même compte/i.test(msg)) return "sameAccount";
  if (/désactivé/i.test(msg)) return "off";
  return "failed";
}

/**
 * Donner de l'argent ou des objets à un autre persona du monde, depuis le
 * composeur. Au montage, seul le monde est lu (l'option Échanges décide si
 * le bloc paraît) ; bourse, objets et destinataires attendent `load`, à
 * l'ouverture du dialogue. La base tranche le reste (`transfer_to_persona`).
 */
export function usePersonaTransfer(worldId: string | null | undefined, personaId: string | null | undefined) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<"loading" | "off" | "on">(worldId && personaId ? "loading" : "off");
  const [units, setUnits] = useState<CurrencyUnit[]>(DEFAULT_CURRENCY_UNITS);
  const [economyOn, setEconomyOn] = useState(false);
  const [inventoryOn, setInventoryOn] = useState(false);
  const [sameAccount, setSameAccount] = useState(false);
  const [balance, setBalance] = useState(0);
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [personas, setPersonas] = useState<TransferRecipient[]>([]);

  useEffect(() => {
    if (!worldId || !personaId) {
      setStatus("off");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const { data } = await supabase
        .from("worlds")
        .select("enable_trades, trades_same_account, enable_economy, enable_inventory, currency_units")
        .eq("id", worldId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as
        | {
            enable_trades?: boolean | null;
            trades_same_account?: boolean | null;
            enable_economy?: boolean | null;
            enable_inventory?: boolean | null;
            currency_units?: unknown;
          }
        | null;
      if (!worldHasTrades(row)) {
        setStatus("off");
        return;
      }
      setUnits(currencyUnitsOf(row!.currency_units));
      setEconomyOn(row!.enable_economy === true);
      setInventoryOn(row!.enable_inventory !== false);
      setSameAccount(row!.trades_same_account === true);
      setStatus("on");
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId, personaId]);

  /** Bourse et objets du donneur, personas du monde : à l'ouverture du dialogue. */
  const load = useCallback(async () => {
    if (status !== "on" || !worldId || !personaId) return;
    const [{ data: wallet }, { data: rows }, { data: list }] = await Promise.all([
      supabase.from("persona_wallets").select("balance").eq("persona_id", personaId).maybeSingle(),
      supabase
        .from("persona_items")
        .select(ITEM_SELECT)
        .eq("persona_id", personaId)
        .order("sort_index", { ascending: true }),
      supabase
        .from("personas")
        .select("id, name, avatar_url, user_id, is_npc")
        .eq("world_id", worldId)
        .eq("is_template", false)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .limit(MAX_RECIPIENTS),
    ]);
    setBalance(Number((wallet as { balance?: number | string } | null)?.balance ?? 0));
    setItems((rows ?? []) as unknown as InventoryRow[]);
    setPersonas((list ?? []) as TransferRecipient[]);
  }, [supabase, status, worldId, personaId]);

  const recipients = useMemo(() => {
    const me = personas.find((p) => p.id === personaId);
    if (!me) return personas.filter((p) => p.id !== personaId);
    return personas.filter((p) => canTradeWith(me, p, sameAccount));
  }, [personas, personaId, sameAccount]);

  const send = useCallback(
    async (args: { to: string; amount: number | null; items: TransferItemPick[]; chatId: string | null }): Promise<TransferResult> => {
      if (!personaId) return { ok: false, error: "failed" };
      const { data, error } = await supabase.rpc("transfer_to_persona", {
        p_from: personaId,
        p_to: args.to,
        p_amount: args.amount ?? 0,
        p_items: args.items,
        p_chat: args.chatId,
      });
      if (error || typeof data !== "string") return { ok: false, error: errorOf(error) };
      return { ok: true, id: data };
    },
    [supabase, personaId],
  );

  return { status, units, economyOn, inventoryOn, balance, items, recipients, load, send };
}
