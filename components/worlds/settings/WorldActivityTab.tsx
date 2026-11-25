"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { DateRange } from "react-day-picker";
import { enUS, es, fr } from "react-day-picker/locale";
import { CalendarDays, Check, ChevronsUpDown, Loader2 } from "lucide-react";

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
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import DateDisplay from "@/components/date-display";
import { cn } from "@/lib/utils";
import { SettingsEmpty, SURFACE } from "./FeatureLayout";

const NO_FILTERS: Required<ActivityFilters> = { kinds: [], personaId: null, from: null, to: null };

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

  const strong = (chunks: ReactNode) => <span className="font-medium text-foreground">{chunks}</span>;
  const nameOf = (name: string | null) => name ?? t("deletedPersona");
  const money = (value: number) => formatAmount(Math.abs(value), units);

  /** L'action en une phrase : qui, quoi, avec qui, combien ; le motif à la suite. */
  const summary = (e: WorldActivityEntry): ReactNode => {
    const persona = nameOf(e.persona_name);
    const items = formatActivityItems(e.items, { signed: e.kind === "item_adjust" });
    let sentence: ReactNode;
    switch (e.kind) {
      case "purchase":
      case "sale":
        sentence = t.rich(`summary.${e.kind}`, {
          persona, items, shop: e.data.shop_name ?? "—", amount: money(e.amount), b: strong,
        });
        break;
      case "transfer": {
        const parts = [e.amount > 0 ? money(e.amount) : "", items].filter(Boolean);
        const gift = parts.length === 2 ? t("summary.and", { a: parts[0], b: parts[1] }) : (parts[0] ?? "—");
        sentence = t.rich("summary.transfer", { persona, gift, target: nameOf(e.target_persona_name), b: strong });
        break;
      }
      case "balance_adjust": {
        const effect = activityBalanceEffect(e);
        sentence = t.rich(effect < 0 ? "summary.loss" : "summary.gain", { persona, amount: money(effect), b: strong });
        break;
      }
      case "item_adjust":
        sentence = t.rich("summary.inventory", { persona, items, b: strong });
        break;
      case "tax_payment":
      case "tax_waive":
        sentence = t.rich(`summary.${e.kind}`, {
          persona, periods: t("periods", { periods: e.data.periods ?? 1 }), amount: money(e.amount), b: strong,
        });
        break;
      case "slots_purchase":
        sentence = t.rich("summary.slots", {
          persona, slots: t("slots", { slots: e.data.slots ?? 0 }), amount: money(e.amount), b: strong,
        });
        break;
    }
    return (
      <>
        {sentence}
        {e.note && ` · « ${e.note} »`}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Les filtres restent en vue pendant qu'on parcourt le journal. Collés
          au bord même de la zone qui défile : le décalage annule son padding
          (p-4, md:p-6 dans WorldSettingsView), qui sinon laisse voir les
          lignes au-dessus. */}
      <div className="sticky -top-4 z-10 flex flex-wrap items-end gap-3 bg-background py-2 md:-top-6">
        <div className="flex flex-col gap-1">
          <Label htmlFor="activity-kind">{t("filters.kind")}</Label>
          <KindsCombobox id="activity-kind" value={filters.kinds} onChange={(kinds) => set({ kinds })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="activity-persona">{t("filters.persona")}</Label>
          <PersonaCombobox
            id="activity-persona"
            personas={personas}
            value={filters.personaId}
            onChange={(personaId) => set({ personaId })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="activity-period">{t("filters.period")}</Label>
          <PeriodPicker
            id="activity-period"
            from={filters.from}
            to={filters.to}
            onChange={(from, to) => set({ from, to })}
          />
        </div>
      </div>

      {entries === null ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <SettingsEmpty>{failed ? t("failed") : t("empty")}</SettingsEmpty>
      ) : (
        <>
          <div className={cn("rounded-lg", SURFACE)}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {(["date", "who", "action", "domain", "detail"] as const).map((c) => (
                    <TableHead
                      key={c}
                      scope="col"
                      className="px-3 text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      {t(`columns.${c}`)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id} data-testid="activity-item">
                    <TableCell className="px-3 text-muted-foreground">
                      <DateDisplay value={e.created_at} />
                    </TableCell>
                    <TableCell className="px-3">{e.actor?.username ?? t("system")}</TableCell>
                    <TableCell className="px-3 font-medium">{t(`kinds.${e.kind}`)}</TableCell>
                    <TableCell className="px-3 text-muted-foreground">{t(`domains.${e.domain}`)}</TableCell>
                    <TableCell className="px-3 whitespace-normal text-muted-foreground">{summary(e)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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

/** Le filtre par type : plusieurs se cochent, la liste reste ouverte. */
function KindsCombobox({
  id,
  value,
  onChange,
}: {
  id: string;
  value: readonly ActivityKind[];
  onChange: (kinds: ActivityKind[]) => void;
}) {
  const t = useTranslations("worldActivity");
  const [open, setOpen] = useState(false);
  // L'ordre de la base, quel que soit l'ordre des clics.
  const toggle = (kind: ActivityKind) =>
    onChange(ACTIVITY_KINDS.filter((k) => (k === kind ? !value.includes(k) : value.includes(k))));
  const label =
    value.length === 0
      ? t("filters.allKinds")
      : value.length === 1
        ? t(`kinds.${value[0]}`)
        : t("filters.kindsCount", { count: value.length });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-56 justify-between font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandList>
            <CommandGroup>
              <CommandItem value="__all" data-checked={value.length === 0} onSelect={() => onChange([])}>
                <Check className={cn("h-3.5 w-3.5", value.length === 0 ? "opacity-100" : "opacity-0")} aria-hidden />
                {t("filters.allKinds")}
              </CommandItem>
              {ACTIVITY_KINDS.map((k) => {
                const checked = value.includes(k);
                return (
                  <CommandItem key={k} value={k} data-checked={checked} onSelect={() => toggle(k)}>
                    <Check className={cn("h-3.5 w-3.5", checked ? "opacity-100" : "opacity-0")} aria-hidden />
                    {t(`kinds.${k}`)}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Le filtre par persona : une liste cherchable par nom, « Tous les personas » en tête. */
function PersonaCombobox({
  id,
  personas,
  value,
  onChange,
}: {
  id: string;
  personas: readonly { id: string; name: string }[];
  value: string | null;
  onChange: (personaId: string | null) => void;
}) {
  const t = useTranslations("worldActivity");
  const tTrades = useTranslations("trades");
  const tPersonas = useTranslations("personas.list");
  const [open, setOpen] = useState(false);
  const chosen = personas.find((p) => p.id === value) ?? null;
  const pick = (personaId: string | null) => {
    onChange(personaId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-56 justify-between font-normal"
        >
          <span className="truncate">{chosen?.name ?? t("filters.allPersonas")}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={tTrades("search")} />
          <CommandList>
            <CommandEmpty>{tPersonas("noMatch")}</CommandEmpty>
            <CommandGroup>
              <CommandItem value={t("filters.allPersonas")} onSelect={() => pick(null)}>
                <Check className={cn("h-3.5 w-3.5", value === null ? "opacity-100" : "opacity-0")} aria-hidden />
                {t("filters.allPersonas")}
              </CommandItem>
              {personas.map((p) => (
                <CommandItem key={p.id} value={p.name} onSelect={() => pick(p.id)}>
                  <Check className={cn("h-3.5 w-3.5", value === p.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="truncate">{p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const CALENDAR_LOCALES = { fr, en: enUS, es } as const;

/** AAAA-MM-JJ du jour local. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayOf(key: string | null): Date | undefined {
  const m = key ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

/** Le filtre par période : une plage choisie au calendrier, bornes comprises. */
function PeriodPicker({
  id,
  from,
  to,
  onChange,
}: {
  id: string;
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}) {
  const t = useTranslations("worldActivity");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const range: DateRange | undefined = from ? { from: dayOf(from), to: dayOf(to) } : undefined;
  const format = (d: Date) => d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const label = range?.from
    ? range.to && dayKey(range.to) !== dayKey(range.from)
      ? `${format(range.from)} – ${format(range.to)}`
      : format(range.from)
    : t("filters.allDates");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className="h-9 justify-start font-normal">
          <CalendarDays className="mr-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          locale={CALENDAR_LOCALES[locale as keyof typeof CALENDAR_LOCALES] ?? fr}
          selected={range}
          defaultMonth={range?.from}
          onSelect={(r) => onChange(r?.from ? dayKey(r.from) : null, r?.to ? dayKey(r.to) : r?.from ? dayKey(r.from) : null)}
        />
        {from && (
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange(null, null);
                setOpen(false);
              }}
            >
              {t("filters.allDates")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
