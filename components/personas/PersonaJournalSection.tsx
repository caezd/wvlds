"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarDays, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relativeTime";
import { compareTimelineDates, formatTimelineLabel } from "@/lib/worldTimeline";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useWorldMembership } from "@/components/providers/WorldMembershipProvider";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { Button } from "@/components/ui/button";
import { AutoResizeTextarea } from "@/components/ui/auto-resizable-textarea";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { TimelineDateFields } from "@/components/worlds/timeline/TimelineDateFields";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { PersonaJournalEntry } from "@/types/db";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

const BODY_MAX = 5000;

/**
 * L'ordre du journal : la chronologie du monde quand elle est active — les
 * entrées datées de la plus récente (fictive) à la plus ancienne, puis les
 * non datées — sinon l'ordre d'écriture, du plus récent au plus ancien.
 */
export function sortJournalEntries<T extends { timeline_date: WorldTimelineDate | null; created_at: string }>(
  entries: T[],
  timelineOn: boolean,
): T[] {
  const byWritten = (a: T, b: T) => b.created_at.localeCompare(a.created_at);
  if (!timelineOn) return [...entries].sort(byWritten);
  return [...entries].sort((a, b) => {
    if (a.timeline_date && b.timeline_date) {
      const c = compareTimelineDates(b.timeline_date, a.timeline_date);
      return c !== 0 ? c : byWritten(a, b);
    }
    if (a.timeline_date) return -1;
    if (b.timeline_date) return 1;
    return byWritten(a, b);
  });
}

type WorldTimelineRow = { timeline_enabled: boolean | null; timeline_config: WorldTimelineConfig | null };

/** La chronologie du monde, si le monde l'a et que la fonctionnalité est ouverte. */
function useWorldTimeline(worldId: string): WorldTimelineConfig | null {
  const supabase = useMemo(() => createClient(), []);
  const { world_timeline } = useFeatureFlags();
  const [config, setConfig] = useState<WorldTimelineConfig | null>(null);
  useEffect(() => {
    if (!world_timeline) { setConfig(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from(TABLE.WORLDS)
        .select("timeline_enabled, timeline_config")
        .eq("id", worldId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as WorldTimelineRow | null;
      setConfig(row?.timeline_enabled && row.timeline_config ? row.timeline_config : null);
    })();
    return () => { cancelled = true; };
  }, [supabase, worldId, world_timeline]);
  return config;
}

function EntryEditor({
  initialBody = "",
  initialDate = null,
  timeline,
  busy,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initialBody?: string;
  initialDate?: WorldTimelineDate | null;
  timeline: WorldTimelineConfig | null;
  busy: boolean;
  onSubmit: (body: string, date: WorldTimelineDate | null) => void;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const t = useTranslations("personas.journal");
  const [body, setBody] = useState(initialBody);
  const [date, setDate] = useState<WorldTimelineDate | null>(initialDate);
  const trimmed = body.trim();
  return (
    <form
      className="space-y-2 rounded-lg border border-border-soft bg-muted/30 p-3"
      onSubmit={(e) => { e.preventDefault(); if (trimmed) onSubmit(trimmed, date); }}
    >
      <AutoResizeTextarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        maxLength={BODY_MAX}
        minRows={3}
        className="text-sm"
        autoFocus
      />
      {timeline && <TimelineDateFields label={t("dateLabel")} value={date} onChange={setDate} config={timeline} />}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums">{body.length}/{BODY_MAX}</span>
        <span className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
              <X className="mr-1 h-3.5 w-3.5" />
              {t("cancel")}
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!trimmed || busy}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            {submitLabel}
          </Button>
        </span>
      </div>
    </form>
  );
}

/**
 * Le journal de bord d'un persona (migration 183) : lu par les membres du
 * monde, écrit par qui joue le persona — son propriétaire, ou un joueur de
 * PNJ. Chaque entrée peut se dater dans la chronologie du monde.
 */
export function PersonaJournalSection({
  personaId,
  worldId,
  ownerId,
  isNpc = false,
}: {
  personaId: string;
  worldId: string;
  ownerId: string;
  isNpc?: boolean;
}) {
  const t = useTranslations("personas.journal");
  const tCard = useTranslations("worlds.members.card");
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const { userId } = useCurrentUser();
  const { worldId: membershipWorldId, can } = useWorldMembership();
  const canWrite = !!userId && (userId === ownerId || (isNpc && membershipWorldId === worldId && can("npc.play")));
  const timeline = useWorldTimeline(worldId);

  const [entries, setEntries] = useState<PersonaJournalEntry[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from(TABLE.PERSONA_JOURNAL_ENTRIES)
      .select("id, persona_id, world_id, author_id, body, timeline_date, created_at, updated_at, author:author_id(username)")
      .eq("persona_id", personaId)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setEntries((data ?? []) as unknown as PersonaJournalEntry[]);
  }, [supabase, personaId]);

  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(() => sortJournalEntries(entries ?? [], timeline !== null), [entries, timeline]);

  async function create(body: string, date: WorldTimelineDate | null) {
    if (!userId) return;
    setBusy(true);
    const { error } = await supabase
      .from(TABLE.PERSONA_JOURNAL_ENTRIES)
      .insert({ persona_id: personaId, world_id: worldId, author_id: userId, body, timeline_date: date });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setComposing(false);
    await load();
  }

  async function update(id: string, body: string, date: WorldTimelineDate | null) {
    setBusy(true);
    const { error } = await supabase
      .from(TABLE.PERSONA_JOURNAL_ENTRIES)
      .update({ body, timeline_date: date })
      .eq("id", id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
    await load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from(TABLE.PERSONA_JOURNAL_ENTRIES).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEntries((prev) => prev?.filter((e) => e.id !== id) ?? null);
  }

  return (
    <div className="space-y-4" data-testid="persona-journal">
      {canWrite && !composing && (
        <Button type="button" size="sm" variant="secondary" onClick={() => setComposing(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("newEntry")}
        </Button>
      )}
      {composing && (
        <EntryEditor timeline={timeline} busy={busy} onSubmit={create} onCancel={() => setComposing(false)} submitLabel={t("save")} />
      )}

      {entries === null ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{canWrite ? t("emptyMine") : t("empty")}</p>
      ) : (
        <ol className="space-y-3">
          {sorted.map((e) => (
            <li key={e.id} className="group/entry rounded-lg border border-border-soft px-3 py-2.5">
              {editingId === e.id ? (
                <EntryEditor
                  initialBody={e.body}
                  initialDate={e.timeline_date}
                  timeline={timeline}
                  busy={busy}
                  onSubmit={(body, date) => update(e.id, body, date)}
                  onCancel={() => setEditingId(null)}
                  submitLabel={t("save")}
                />
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {timeline && e.timeline_date && (
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          <CalendarDays className="h-3 w-3" aria-hidden />
                          {formatTimelineLabel(timeline, e.timeline_date)}
                        </span>
                      )}
                      <time dateTime={e.created_at} className={cn(timeline && e.timeline_date && "truncate")}>
                        {relativeTime(e.created_at, locale, tCard("justNow"))}
                      </time>
                      {isNpc && e.author?.username && <span className="truncate">· @{e.author.username}</span>}
                    </span>
                    {canWrite && (
                      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/entry:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => setEditingId(e.id)}
                          aria-label={t("edit")}
                          title={t("edit")}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <DeleteConfirmDialog
                          trigger={
                            <button type="button" aria-label={t("delete")} title={t("delete")} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          }
                          description={t("deleteDescription")}
                          onConfirm={() => void remove(e.id)}
                        />
                      </span>
                    )}
                  </div>
                  <MarkdownRenderer content={e.body} className="mt-1.5 text-sm prose-sm" />
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
