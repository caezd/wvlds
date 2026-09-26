"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";
import { compareTimelineDates, formatTimelineLabel } from "@/lib/worldTimeline";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

type ArcOption = { id: string; name: string };
type RoomOption = { id: string; title: string | null; name: string | null; timeline_date: WorldTimelineDate };
type Links = { arc_id: string | null; previous_chatroom_id: string | null };

/**
 * L'arc d'un salon et le salon dont il est la suite (migration 193), sous
 * sa date dans ses réglages. Chaque choix s'enregistre aussitôt, comme le
 * reste du panneau ; la base refuse une suite qui bouclerait.
 */
export function ChatroomTimelineLinks({
  chatroomId,
  worldId,
  config,
  supabase,
  disabled,
  onSaved,
}: {
  chatroomId: string;
  worldId: string;
  config: WorldTimelineConfig;
  supabase: ReturnType<typeof createClient>;
  disabled?: boolean;
  onSaved?: () => void;
}) {
  const t = useTranslations("chatrooms");
  const [arcs, setArcs] = React.useState<ArcOption[]>([]);
  const [rooms, setRooms] = React.useState<RoomOption[]>([]);
  const [links, setLinks] = React.useState<Links>({ arc_id: null, previous_chatroom_id: null });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void Promise.all([
      supabase.from(TABLE.WORLD_TIMELINE_ARCS).select("id, name").eq("world_id", worldId).order("position").order("name"),
      supabase
        .from(TABLE.CHATROOMS)
        .select("id, title, name, timeline_date")
        .eq("world_id", worldId)
        .not("timeline_date", "is", null),
      supabase.from(TABLE.CHATROOMS).select("arc_id, previous_chatroom_id").eq("id", chatroomId).maybeSingle(),
    ]).then(([arcRes, roomRes, selfRes]) => {
      if (cancelled) return;
      if (arcRes.error || roomRes.error || selfRes.error) {
        console.error("[ChatroomTimelineLinks] chargement", arcRes.error ?? roomRes.error ?? selfRes.error);
      }
      setArcs((arcRes.data ?? []) as ArcOption[]);
      setRooms(
        ((roomRes.data ?? []) as RoomOption[])
          .filter((r) => r.id !== chatroomId)
          .sort((a, b) => compareTimelineDates(a.timeline_date, b.timeline_date)),
      );
      const self = selfRes.data as Links | null;
      if (self) setLinks({ arc_id: self.arc_id, previous_chatroom_id: self.previous_chatroom_id });
    });
    return () => { cancelled = true; };
  }, [supabase, worldId, chatroomId]);

  async function persist(patch: Partial<Links>) {
    setSaving(true);
    const { error } = await supabase.from(TABLE.CHATROOMS).update(patch).eq("id", chatroomId);
    setSaving(false);
    if (error) {
      // Pas `error.message` : le texte brut de PostgreSQL.
      console.error("[ChatroomTimelineLinks] enregistrement", error);
      toast.error(t("settingsTimelineLinksFailed"));
      return;
    }
    setLinks((l) => ({ ...l, ...patch }));
    onSaved?.();
  }

  const selectClass = "h-8 w-full rounded-lg border border-border bg-transparent px-2 text-sm disabled:opacity-50";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">{t("settingsArc")}</span>
        <select
          value={links.arc_id ?? ""}
          disabled={disabled || saving}
          onChange={(e) => void persist({ arc_id: e.target.value || null })}
          className={selectClass}
        >
          <option value="">{t("settingsArcNone")}</option>
          {arcs.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">{t("settingsSuiteOf")}</span>
        <select
          value={links.previous_chatroom_id ?? ""}
          disabled={disabled || saving}
          onChange={(e) => void persist({ previous_chatroom_id: e.target.value || null })}
          className={selectClass}
        >
          <option value="">{t("settingsSuiteNone")}</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {`${r.title ?? r.name ?? ""} — ${formatTimelineLabel(config, r.timeline_date)}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
