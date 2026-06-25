"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generate } from "boring-name-generator";
import { createClient } from "@/lib/supabase/client";
import type { Persona } from "@/types/db";
import { toast } from "sonner";
import { TABLE } from "@/lib/constants";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";
import { ChatroomComposer } from "@/components/chatrooms/ChatroomComposer";
import type { WorldTimelineConfig, WorldTimelineDate } from "@/types/worlds";

type MapPinOption = { id: string; title: string; color: string };

/**
 * Composer affiché sur la page d'accueil d'un monde pour créer une nouvelle
 * chatroom avec son premier message. Adaptateur mince autour du composer
 * universel (ChatroomComposer) : toute amélioration de ce dernier est donc
 * automatiquement reflétée ici.
 */

function formatTimelineDate(date: WorldTimelineDate, config: WorldTimelineConfig): string {
  const yearPart = `${config.year_label} ${date.year}${config.era_name ? ` ${config.era_name}` : ""}`;
  if (date.month !== null && config.month_names[date.month]) {
    return `${config.month_names[date.month]}, ${yearPart}`;
  }
  return yearPart;
}

function TimelineDatePicker({
  config,
  value,
  onChange,
}: {
  config: WorldTimelineConfig;
  value: WorldTimelineDate | null;
  onChange: (d: WorldTimelineDate | null) => void;
}) {
  const hasMonths = config.month_names.length > 0;
  const enabled = value !== null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-1 py-1 text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => onChange(enabled ? null : { year: config.current_year, month: config.current_month })}
        className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
          enabled
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border bg-transparent hover:border-muted-foreground/40 hover:text-foreground"
        }`}
      >
        {enabled && value ? formatTimelineDate(value, config) : "Situer dans la chronologie"}
      </button>

      {enabled && value && (
        <>
          <input
            type="number"
            value={value.year}
            min={-99999}
            max={99999}
            className="h-6 w-20 rounded-md border border-input bg-background px-2 text-xs"
            onChange={e => onChange({ ...value, year: Number(e.target.value) || 1 })}
          />
          {hasMonths && (
            <select
              value={value.month ?? ""}
              className="h-6 rounded-md border border-input bg-background px-1 text-xs"
              onChange={e => onChange({ ...value, month: e.target.value === "" ? null : Number(e.target.value) })}
            >
              <option value="">Mois —</option>
              {config.month_names.map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
          )}
        </>
      )}
    </div>
  );
}

export function WorldChatComposer({
  worldId,
  timelineConfig,
}: {
  worldId: string;
  timelineConfig?: WorldTimelineConfig | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { userId } = useCurrentUser();
  const { world_map } = useFeatureFlags();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [timelineDate, setTimelineDate] = useState<WorldTimelineDate | null>(null);
  const [mapPins, setMapPins] = useState<MapPinOption[]>([]);
  const [mapPinId, setMapPinId] = useState<string | null>(null);

  useEffect(() => {
    if (!world_map) return;
    void supabase
      .from("world_map_pins")
      .select("id, title, color")
      .eq("world_id", worldId)
      .order("sort_index")
      .then(({ data }) => setMapPins((data ?? []) as MapPinOption[]));
  }, [worldId, world_map]); // eslint-disable-line react-hooks/exhaustive-deps

  async function resolveChat(): Promise<{ chatId: string } | null> {
    if (!userId) {
      toast.error("Vous devez être connecté.");
      return null;
    }
    const title = (() => {
      try { return generate({ words: 2 }).spaced; }
      catch { return "Conversation"; }
    })();

    const insert: Record<string, unknown> = { world_id: worldId, title, created_by: userId };
    if (timelineDate !== null) insert.timeline_date = timelineDate;
    if (mapPinId !== null) insert.map_pin_id = mapPinId;

    const { data: room, error } = await supabase
      .from(TABLE.CHATROOMS)
      .insert(insert)
      .select("id")
      .single();

    if (error || !room) {
      toast.error(error?.message ?? "Impossible de créer la chatroom.");
      return null;
    }
    return { chatId: room.id };
  }

  return (
    <ChatroomComposer
      presetPersona={persona}
      onPersonaChange={setPersona}
      placeholder="Nouveau jeu…"
      onResolveChat={resolveChat}
      onAfterSend={(chatId) => router.push(`/c/${chatId}`)}
      worldTimelineConfig={timelineConfig ?? null}
      timelineDate={timelineDate}
      onTimelineDateChange={setTimelineDate}
      mapPins={mapPins}
      mapPinId={mapPinId}
      onMapPinChange={setMapPinId}
    />
  );
}
