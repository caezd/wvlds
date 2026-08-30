"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { useGlobalPresence } from "@/components/providers/PresenceProvider";
import { AvatarWithFrame } from "@/components/avatars/AvatarWithFrame";
import { getInitials } from "@/lib/textFormatting";

const PersonaProfileSheetTrigger = dynamic(() =>
  import("@/components/personas/PersonaProfileSheetTrigger").then((m) => m.PersonaProfileSheetTrigger),
);

const DEFAULT_PERSONA_LIMIT = 10;

export type RecentPersona = {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  faceclaim: string | null;
  frame?: { asset_url: string | null } | null;
};

/** Personas les plus récemment créées dans le monde. */
export function WorldRecentPersonasWidget({
  worldId,
  limit = DEFAULT_PERSONA_LIMIT,
  initialPersonas,
}: {
  worldId: string;
  /** Nombre de personas listées — réglage du widget (voir WORLD_HOME_WIDGET_OPTIONS). */
  limit?: number;
  /** Données résolues côté serveur (cf. WorldHomeContent). `undefined` =
   *  non fournies, le widget charge alors lui-même au montage. */
  initialPersonas?: RecentPersona[];
}) {
  const t = useTranslations("worlds");
  const [personas, setPersonas] = useState<RecentPersona[]>(initialPersonas ?? []);
  const hasServerData = initialPersonas !== undefined;
  const { getUserPresence } = useGlobalPresence();
  const reconnectEpoch = useReconnectEpoch();

  useEffect(() => {
    const supabase = createClient();

    const load = async () => {
      const { data } = await supabase
        .from("personas")
        .select("id, user_id, name, avatar_url, faceclaim, frame:avatar_frame_id(asset_url)")
        .eq("world_id", worldId)
        .eq("is_template", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      setPersonas((data as unknown as RecentPersona[] | null) ?? []);
    };

    // Le serveur a déjà fourni la liste : `load` ne sert plus qu'au Realtime.
    if (!hasServerData) void load();

    const channel = supabase
      .channel(`world_recent_personas:${worldId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "personas", filter: `world_id=eq.${worldId}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [worldId, reconnectEpoch, limit, hasServerData]);

  if (personas.length === 0) return null;

  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("home.widgets.personas_recent")}
      </p>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {personas.map((persona) => (
          <PersonaProfileSheetTrigger
            key={persona.id}
            personaId={persona.id}
            userId={persona.user_id}
            label={persona.name}
            hoverPreview
            triggerClassName="flex w-16 shrink-0 flex-col items-center gap-1.5"
          >
            <AvatarWithFrame
              src={persona.avatar_url}
              alt={persona.name}
              fallback={getInitials(persona.name)}
              presenceState={getUserPresence(persona.user_id)}
              size={48}
              frameUrl={persona.frame?.asset_url}
              className="rounded-lg"
            />
            <span className="w-full truncate text-center text-xs text-foreground/90">{persona.name}</span>
          </PersonaProfileSheetTrigger>
        ))}
      </div>
    </div>
  );
}
