"use client";

import { useEffect, useSyncExternalStore } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Qui est en défaut de taxe (vue `persona_tax_overdue`, migration 255), pour
 * le badge à côté des noms. Un fil de messages affiche des dizaines de noms :
 * les personas demandés pendant un même rendu se lisent en une requête, et
 * la réponse reste en mémoire. Un paiement ou une annulation l'invalide
 * (`invalidateTaxBadges`).
 */

export type TaxBadge = { periods: number; label: string | null };

const cache = new Map<string, TaxBadge | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let scheduled = false;

function emit() {
  for (const l of listeners) l();
}

async function flush() {
  scheduled = false;
  const ids = [...pending];
  pending.clear();
  if (ids.length === 0) return;
  const { data, error } = await createClient()
    .from("persona_tax_overdue")
    .select("persona_id, periods, badge_label")
    .in("persona_id", ids);
  if (error) return;
  for (const id of ids) cache.set(id, null);
  for (const row of (data ?? []) as { persona_id: string; periods: number; badge_label: string | null }[]) {
    cache.set(row.persona_id, { periods: Number(row.periods), label: row.badge_label });
  }
  emit();
}

function request(id: string) {
  if (cache.has(id) || pending.has(id)) return;
  pending.add(id);
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(() => void flush());
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Le badge d'un persona, ou `null` (à jour, inconnu, ou pas encore lu). */
export function useTaxBadge(personaId: string | null | undefined): TaxBadge | null {
  const badge = useSyncExternalStore(
    subscribe,
    () => (personaId ? cache.get(personaId) ?? null : null),
    () => null,
  );
  const known = useSyncExternalStore(
    subscribe,
    () => (personaId ? cache.has(personaId) : true),
    () => true,
  );
  useEffect(() => {
    if (personaId && !known) request(personaId);
  }, [personaId, known]);
  return badge;
}

/** Relit un persona (ou tous) : sa dette a changé. */
export function invalidateTaxBadges(personaId?: string) {
  if (personaId) cache.delete(personaId);
  else cache.clear();
  emit();
}

export function resetTaxBadgesForTests() {
  cache.clear();
  pending.clear();
  listeners.clear();
  scheduled = false;
}
