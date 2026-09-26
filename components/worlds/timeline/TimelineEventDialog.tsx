"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { createClient } from "@/lib/supabase/client";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";
import { TABLE } from "@/lib/constants";
import { DB_TEXT_LIMITS } from "@/lib/textLimits";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TimelineDatePicker } from "@/components/worlds/timeline/TimelineDatePicker";
import type { TimelineEvent } from "@/components/worlds/timeline/useTimelineData";

type WikiPageOption = { id: string; title: string };

/**
 * Créer ou modifier un événement du monde : un jalon daté sans salon
 * (migration 193). La date n'obéit pas à la restriction à la période en
 * cours — elle vaut pour les salons, pas pour l'histoire du monde. La
 * suppression se confirme dans le dialogue même, sans en ouvrir un second.
 */
export function TimelineEventDialog({
  open,
  onOpenChange,
  supabase,
  worldId,
  config,
  event,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supabase: ReturnType<typeof createClient>;
  worldId: string;
  config: WorldTimelineConfig;
  /** L'événement à modifier ; `null` pour en créer un. */
  event: TimelineEvent | null;
  onSaved: () => void;
}) {
  const t = useTranslations("worlds.timelineView");
  const { userId } = useCurrentUser();
  const freeConfig = React.useMemo(() => ({ ...config, restrict_to_current: false }), [config]);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [date, setDate] = React.useState<WorldTimelineDate>({ year: config.current_year, month: config.current_month, day: null });
  const [wikiPageId, setWikiPageId] = React.useState<string | null>(null);
  const [pages, setPages] = React.useState<WikiPageOption[]>([]);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // À chaque ouverture : l'événement tel qu'il est, ou un brouillon daté du
  // jour du monde ; et les pages du wiki, pour le lien.
  React.useEffect(() => {
    if (!open) return;
    setTitle(event?.title ?? "");
    setDescription(event?.description ?? "");
    setDate(event?.date ?? { year: config.current_year, month: config.current_month, day: null });
    setWikiPageId(event?.wikiPageId ?? null);
    setConfirmDelete(false);
    let cancelled = false;
    void supabase
      .from(TABLE.WORLD_WIKI_PAGES)
      .select("id, title")
      .eq("world_id", worldId)
      .order("title")
      .then(({ data, error }: { data: WikiPageOption[] | null; error: unknown }) => {
        if (cancelled) return;
        if (error) console.error("[TimelineEventDialog] pages du wiki", error);
        setPages(data ?? []);
      });
    return () => { cancelled = true; };
  }, [open, event, supabase, worldId, config.current_year, config.current_month]);

  async function save() {
    const clean = title.trim();
    if (!clean) {
      toast.error(t("eventTitleRequired"));
      return;
    }
    setBusy(true);
    const fields = {
      title: clean,
      description: description.trim() || null,
      timeline_date: date,
      wiki_page_id: wikiPageId,
    };
    const { error } = event
      ? await supabase.from(TABLE.WORLD_TIMELINE_EVENTS).update(fields).eq("id", event.id)
      : await supabase.from(TABLE.WORLD_TIMELINE_EVENTS).insert({ ...fields, world_id: worldId, created_by: userId });
    setBusy(false);
    if (error) {
      toast.error(t("eventSaveFailed"));
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  async function remove() {
    if (!event) return;
    setBusy(true);
    const { error } = await supabase.from(TABLE.WORLD_TIMELINE_EVENTS).delete().eq("id", event.id);
    setBusy(false);
    if (error) {
      toast.error(t("eventDeleteFailed"));
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? t("editEvent") : t("newEvent")}</DialogTitle>
          <DialogDescription>{t("eventHelp")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("eventTitle")}</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={DB_TEXT_LIMITS["world_timeline_events.title"]}
              placeholder={t("eventTitlePlaceholder")}
              autoFocus
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t("eventDate")}</span>
            <TimelineDatePicker config={freeConfig} value={date} onCommit={setDate} />
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("eventDescription")}</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DB_TEXT_LIMITS["world_timeline_events.description"]}
              rows={3}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("eventWikiPage")}</span>
            <select
              value={wikiPageId ?? ""}
              onChange={(e) => setWikiPageId(e.target.value || null)}
              className="h-9 w-full rounded-lg border border-border bg-transparent px-2 text-sm"
            >
              <option value="">{t("eventNoWikiPage")}</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {event ? (
            confirmDelete ? (
              <Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>
                {t("eventDeleteConfirm")}
              </Button>
            ) : (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>
                {t("eventDelete")}
              </Button>
            )
          ) : <span />}
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {t("eventSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
