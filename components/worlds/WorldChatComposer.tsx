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
import { useTranslations } from "next-intl";

type MapPinOption = { id: string; title: string; color: string };

/**
 * Composer affiché sur la page d'accueil d'un monde pour créer une nouvelle
 * chatroom avec son premier message. Adaptateur mince autour du composer
 * universel (ChatroomComposer) : toute amélioration de ce dernier est donc
 * automatiquement reflétée ici.
 */


export function WorldChatComposer({
  worldId,
  timelineConfig,
}: {
  worldId: string;
  timelineConfig?: WorldTimelineConfig | null;
}) {
  const t = useTranslations("worlds");
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
      .then(({ data }: { data: MapPinOption[] | null }) => setMapPins(data ?? []));
  }, [worldId, world_map]); // eslint-disable-line react-hooks/exhaustive-deps

  async function resolveChat(): Promise<{ chatId: string } | null> {
    if (!userId) {
      toast.error(t("composer.errorNotConnected"));
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
      toast.error(error?.message ?? t("composer.errorCreateFailed"));
      return null;
    }
    return { chatId: room.id };
  }

  return (
    <ChatroomComposer
      presetPersona={persona}
      onPersonaChange={setPersona}
      placeholder={t("composer.placeholder")}
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
