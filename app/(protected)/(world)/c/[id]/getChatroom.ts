import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { PostgrestError } from "@supabase/supabase-js";

export type ChatroomWithWorld = {
  id: string;
  name: string | null;
  title: string | null;
  banner_url: string | null;
  icon_url: string | null;
  world_id: string | null;
  created_by: string | null;
  timeline_date: unknown;
  map_pin_id: string | null;
  category_id: string | null;
  visibility: string;
  synopsis: string | null;
  /** Le temps du salon (migration 275). */
  day_icon?: string | null;
  day_position?: number | null;
  day_current_icon?: string | null;
  day_current_position?: number | null;
  timeline_current_date?: unknown;
  worlds: unknown;
};

/**
 * Ligne `chatrooms` (+ `worlds` pour la sidebar/le monde associé), mémoïsée
 * par `id` pour la durée de la requête — `layout.tsx` (sidebar) et
 * `page.tsx` (contenu) la chargeaient chacun séparément.
 */
export const getChatroomWithWorld = cache(
  async (
    id: string,
  ): Promise<{ data: ChatroomWithWorld | null; error: PostgrestError | null }> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("chatrooms")
      .select(
        "id, name, title, banner_url, icon_url, world_id, created_by, timeline_date, map_pin_id, category_id, visibility, synopsis, day_icon, day_position, day_current_icon, day_current_position, timeline_current_date, worlds(id, name, owner_id, enable_live_chat, restrict_skills, dice_mode, dice_allow_edit, dice_critical, dice_fumble, timeline_enabled, timeline_config, world_members(user_id))",
      )
      .eq("id", id)
      .single();
    return { data: (data as ChatroomWithWorld | null) ?? null, error };
  },
);
