"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";

import type { createClient } from "@/lib/supabase/client";
import { RPC, TABLE } from "@/lib/constants";
import { compareTimelineDates, formatTimelineLabel } from "@/lib/worldTimeline";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

type ArcOption = { id: string; name: string };
type RoomOption = { id: string; title: string | null; timeline_date: WorldTimelineDate; mine: boolean };
type SequelRow = { id: string; previous_id: string; status: "pending" | "accepted" };

/**
 * L'arc d'un salon et les salons qu'il suit (migrations 193 et 194), sous
 * sa date dans ses réglages. Un salon peut en suivre plusieurs (deux scènes
 * qui se rejoignent). Relier à un salon où l'on ne joue pas en fait une
 * suite proposée : elle attend l'accord de ses participants.
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
  const [arcId, setArcId] = React.useState<string | null>(null);
  const [sequels, setSequels] = React.useState<SequelRow[]>([]);
  const [saving, setSaving] = React.useState(false);

  const loadSequels = React.useCallback(async () => {
    const { data, error } = await supabase
      .from(TABLE.CHATROOM_SEQUELS)
      .select("id, previous_id, status")
      .eq("chatroom_id", chatroomId);
    if (error) console.error("[ChatroomTimelineLinks] suites", error);
    setSequels((data ?? []) as SequelRow[]);
  }, [supabase, chatroomId]);

  React.useEffect(() => {
    let cancelled = false;
    void Promise.all([
      supabase.from(TABLE.WORLD_TIMELINE_ARCS).select("id, name").eq("world_id", worldId).order("position").order("name"),
      supabase.rpc(RPC.GET_LINKABLE_CHATROOMS, { p_world_id: worldId }),
      supabase.from(TABLE.CHATROOMS).select("arc_id").eq("id", chatroomId).maybeSingle(),
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
      setArcId((selfRes.data as { arc_id: string | null } | null)?.arc_id ?? null);
    });
    void loadSequels();
    return () => { cancelled = true; };
  }, [supabase, worldId, chatroomId, loadSequels]);

  async function saveArc(next: string | null) {
    setSaving(true);
    const { error } = await supabase.from(TABLE.CHATROOMS).update({ arc_id: next }).eq("id", chatroomId);
    setSaving(false);
    if (error) {
      // Pas `error.message` : le texte brut de PostgreSQL.
      console.error("[ChatroomTimelineLinks] arc", error);
      toast.error(t("settingsTimelineLinksFailed"));
      return;
    }
    setArcId(next);
    onSaved?.();
  }

  async function addPrevious(previousId: string) {
    setSaving(true);
    const { data, error } = await supabase
      .from(TABLE.CHATROOM_SEQUELS)
      .insert({ world_id: worldId, chatroom_id: chatroomId, previous_id: previousId })
      .select("status")
      .maybeSingle();
    setSaving(false);
    if (error) {
      console.error("[ChatroomTimelineLinks] suite", error);
      toast.error(t("settingsTimelineLinksFailed"));
      return;
    }
    // Relié à un salon où l'on ne joue pas : la suite attend son accord.
    if ((data as { status: string } | null)?.status === "pending") toast.info(t("settingsSuiteProposed"));
    await loadSequels();
    onSaved?.();
  }

  async function removePrevious(sequelId: string) {
    setSaving(true);
    const { error } = await supabase.from(TABLE.CHATROOM_SEQUELS).delete().eq("id", sequelId);
    setSaving(false);
    if (error) {
      console.error("[ChatroomTimelineLinks] retrait", error);
      toast.error(t("settingsTimelineLinksFailed"));
      return;
    }
    await loadSequels();
    onSaved?.();
  }

  const byId = new Map(rooms.map((r) => [r.id, r]));
  const linked = new Set(sequels.map((s) => s.previous_id));
  const candidates = rooms.filter((r) => !linked.has(r.id));
  const label = (r: RoomOption) => `${r.title ?? ""} — ${formatTimelineLabel(config, r.timeline_date)}`;
  const selectClass = "h-8 w-full rounded-lg border border-border bg-transparent px-2 text-sm disabled:opacity-50";

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">{t("settingsArc")}</span>
        <select
          value={arcId ?? ""}
          disabled={disabled || saving}
          onChange={(e) => void saveArc(e.target.value || null)}
          className={selectClass}
        >
          <option value="">{t("settingsArcNone")}</option>
          {arcs.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t("settingsSuiteOf")}</span>
        {sequels.length > 0 && (
          <ul className="space-y-1" aria-label={t("settingsSuiteOf")}>
            {sequels.map((s) => {
              const room = byId.get(s.previous_id);
              return (
                <li key={s.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-sm">
                  <span className="min-w-0 flex-1 truncate">{room ? label(room) : t("settingsSuiteUnknown")}</span>
                  {s.status === "pending" && (
                    <span className="shrink-0 rounded-full border border-dashed border-border px-1.5 text-[10px] text-muted-foreground">
                      {t("settingsSuitePending")}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={disabled || saving}
                    onClick={() => void removePrevious(s.id)}
                    aria-label={t("settingsSuiteRemove", { title: room?.title ?? "" })}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <select
          value=""
          disabled={disabled || saving || candidates.length === 0}
          onChange={(e) => { if (e.target.value) void addPrevious(e.target.value); }}
          className={selectClass}
          aria-label={t("settingsSuiteAdd")}
        >
          <option value="">{t("settingsSuiteAdd")}</option>
          {candidates.some((r) => r.mine) && (
            <optgroup label={t("settingsSuiteMine")}>
              {candidates.filter((r) => r.mine).map((r) => (
                <option key={r.id} value={r.id}>{label(r)}</option>
              ))}
            </optgroup>
          )}
          {candidates.some((r) => !r.mine) && (
            <optgroup label={t("settingsSuiteOthers")}>
              {candidates.filter((r) => !r.mine).map((r) => (
                <option key={r.id} value={r.id}>{label(r)}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    </div>
  );
}
