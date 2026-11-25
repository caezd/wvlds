"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { invalidateTaxBadges } from "@/lib/taxBadgeStore";
import { taxSettingsOf, type TaxDue, type TaxSettings } from "@/lib/worldTax";

export type TaxPayResult = { ok: true } | { ok: false; error: "insufficient" | "failed" };

const WORLD_COLUMNS =
  "enable_economy, tax_enabled, tax_amount, tax_every, tax_unit, tax_anchor, tax_mode, tax_accumulate, tax_grace_new, tax_badge_label";

/**
 * La taxe d'un persona (migration 255) : les réglages de son monde et ses
 * dettes non réglées (période en cours comprise), payer et annuler. `off`
 * tant que la taxe ou l'économie du monde est coupée : rien d'autre n'est lu.
 */
export function usePersonaTax(personaId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<"loading" | "off" | "on">(personaId ? "loading" : "off");
  const [settings, setSettings] = useState<TaxSettings | null>(null);
  const [dues, setDues] = useState<TaxDue[]>([]);

  const loadDues = useCallback(async () => {
    if (!personaId) return;
    const { data } = await supabase
      .from("persona_tax_dues")
      .select("id, period_start, period_end, amount")
      .eq("persona_id", personaId)
      .is("paid_at", null)
      .is("waived_at", null)
      .lte("period_start", new Date().toISOString())
      .order("period_start");
    setDues(((data ?? []) as TaxDue[]).map((d) => ({ ...d, amount: Number(d.amount) })));
  }, [supabase, personaId]);

  useEffect(() => {
    if (!personaId) {
      setStatus("off");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const { data: persona } = await supabase.from("personas").select("world_id").eq("id", personaId).maybeSingle();
      const worldId = (persona as { world_id?: string | null } | null)?.world_id;
      if (cancelled) return;
      if (!worldId) {
        setStatus("off");
        return;
      }
      const { data: world } = await supabase.from("worlds").select(WORLD_COLUMNS).eq("id", worldId).maybeSingle();
      if (cancelled) return;
      const row = world as ({ enable_economy?: boolean | null } & Record<string, unknown>) | null;
      if (!row?.enable_economy || !row.tax_enabled) {
        setStatus("off");
        return;
      }
      setSettings(taxSettingsOf(row as Parameters<typeof taxSettingsOf>[0]));
      await loadDues();
      if (!cancelled) setStatus("on");
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, personaId, loadDues]);

  const pay = useCallback(async (): Promise<TaxPayResult> => {
    if (!personaId) return { ok: false, error: "failed" };
    const { error } = await supabase.rpc("pay_persona_tax", { p_persona: personaId });
    if (error) {
      return { ok: false, error: /insuffisant/i.test(error.message ?? "") ? "insufficient" : "failed" };
    }
    await loadDues();
    invalidateTaxBadges(personaId);
    return { ok: true };
  }, [supabase, personaId, loadDues]);

  const waive = useCallback(async (): Promise<boolean> => {
    if (!personaId) return false;
    const { error } = await supabase.rpc("waive_persona_tax", { p_persona: personaId });
    if (error) return false;
    await loadDues();
    invalidateTaxBadges(personaId);
    return true;
  }, [supabase, personaId, loadDues]);

  return { status, settings, dues, pay, waive };
}
