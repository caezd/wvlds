"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { History, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  ACTIVITY_KINDS,
  activityBalanceEffect,
  fetchWorldActivity,
  formatActivityItems,
  type ActivityCursor,
  type ActivityFilters,
  type ActivityKind,
  type WorldActivityEntry,
} from "@/lib/worldActivity";
import { formatAmount, type CurrencyUnit } from "@/lib/worldCurrency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DateDisplay from "@/components/date-display";
import { cn } from "@/lib/utils";
import { SURFACE } from "./FeatureLayout";

const SELECT_CLASS =
  "h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary";

const NO_FILTERS: Required<ActivityFilters> = { kind: null, personaId: null, from: null, to: null };

/**
 * Le journal d'activité d'un monde (migration 254) : l'économie pour
 * l'instant. Visible de qui gère l'économie ; la base fait foi (RLS).
 */
export function WorldActivityTab({ worldId, units }: { worldId: string; units: readonly CurrencyUnit[] }) {
  const t = useTranslations("worldActivity");
  const supabase = useMemo(() => createClient(), []);
  const [filters, setFilters] = useState<Required<ActivityFilters>>(NO_FILTERS);
  const [entries, setEntries] = useState<WorldActivityEntry[] | null>(null);
  const [cursor, setCursor] = useState<ActivityCursor | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [personas, setPersonas] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("personas")
      .select("id, name")
      .eq("world_id", worldId)
      .eq("is_template", false)
      .is("deleted_at", null)
      .order("name")
      .then(({ data }: { data: unknown }) => {
        if (!cancelled) setPersonas((data ?? []) as { id: string; name: string }[]);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId]);

  // Un filtre changé : on relit depuis le début.
  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    void fetchWorldActivity(supabase, worldId, filters, null).then((page) => {
      if (cancelled) return;
      setEntries(page.entries);
      setCursor(page.cursor);
      setFailed(!!page.error);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, worldId, filters]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    const page = await fetchWorldActivity(supabase, worldId, filters, cursor);
    setLoadingMore(false);
    setEntries((prev) => [...(prev ?? []), ...page.entries]);
    setCursor(page.cursor);
    if (page.error) setFailed(true);
  }, [supabase, worldId, filters, cursor]);

  const set = (patch: Partial<ActivityFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const line = (e: WorldActivityEntry): string => {
    const persona = e.persona_name ?? t("deletedPersona");
    const amount = formatAmount(Math.abs(e.amount), units);
    const items = formatActivityItems(e.items);
    switch (e.kind) {
      case "purchase":
      case "sale":
        // Les achats repris de l'historique n'ont pas leurs objets : le motif seul.
        if (e.items.length === 0) return t("lines.generic", { kind: t(`kinds.${e.kind}`), persona, amount });
        return t(`lines.${e.kind}`, { persona, items, shop: e.data.shop_name ?? "", amount });
      case "transfer": {
        const what = [e.amount > 0 ? amount : null, items || null].filter(Boolean).join(", ");
        return t("lines.transfer", { persona, what, target: e.target_persona_name ?? t("deletedPersona") });
      }
      case "balance_adjust":
        return t("lines.balance_adjust", { persona, amount: formatAmount(activityBalanceEffect(e), units, { signed: true }) });
      case "item_adjust":
        return t("lines.item_adjust", { persona, items: formatActivityItems(e.items, { signed: true }) });
      case "slots_purchase":
        return t("lines.slots_purchase", { persona, slots: e.data.slots ?? 0, amount });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="activity-kind">{t("filters.kind")}</Label>
          <select
            id="activity-kind"
            className={SELECT_CLASS}
            value={filters.kind ?? ""}
            onChange={(e) => set({ kind: (e.target.value || null) as ActivityKind | null })}
          >
            <option value="">{t("filters.allKinds")}</option>
            {ACTIVITY_KINDS.map((k) => (
              <option key={k} value={k}>{t(`kinds.${k}`)}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="activity-persona">{t("filters.persona")}</Label>
          <select
            id="activity-persona"
            className={SELECT_CLASS}
            value={filters.personaId ?? ""}
            onChange={(e) => set({ personaId: e.target.value || null })}
          >
            <option value="">{t("filters.allPersonas")}</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="activity-from">{t("filters.from")}</Label>
          <Input
            id="activity-from"
            type="date"
            className="h-9 w-auto"
            value={filters.from ?? ""}
            onChange={(e) => set({ from: e.target.value || null })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="activity-to">{t("filters.to")}</Label>
          <Input
            id="activity-to"
            type="date"
            className="h-9 w-auto"
            value={filters.to ?? ""}
            onChange={(e) => set({ to: e.target.value || null })}
          />
        </div>
      </div>

      {entries === null ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <History className="h-5 w-5" />
          {failed ? t("failed") : t("empty")}
        </div>
      ) : (
        <>
          <ul className={cn("divide-y divide-border rounded-md", SURFACE)}>
            {entries.map((e) => (
              <li key={e.id} className="px-3 py-2" data-testid="activity-item">
                <p className="text-sm">{line(e)}</p>
                {e.note && <p className="text-sm text-muted-foreground">« {e.note} »</p>}
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  <span>{t(`kinds.${e.kind}`)}</span>
                  <span>·</span>
                  <span>{e.actor?.username ?? t("system")}</span>
                  <span>·</span>
                  <DateDisplay value={e.created_at} />
                </div>
              </li>
            ))}
          </ul>
          {cursor && (
            <div className="flex justify-center">
              <Button type="button" variant="ghost" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                {t("more")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
