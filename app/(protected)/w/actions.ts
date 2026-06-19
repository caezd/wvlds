"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type WorldPrefsInput = {
  aside_width?: number;
  main_expanded?: boolean;
  is_favorite?: boolean;
  wiki_sidebar_width?: number;
};

export async function saveWorldPrefs(
  worldId: string,
  prefs: WorldPrefsInput,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("world_user_preferences").upsert(
    {
      world_id: worldId,
      user_id: user.id,
      ...prefs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "world_id,user_id" },
  );

  if (error) {
    console.error("[saveWorldPrefs]", error.message);
  }
}

export async function toggleWorldFavorite(
  worldId: string,
  isFavorite: boolean,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("world_user_preferences").upsert(
    {
      world_id: worldId,
      user_id: user.id,
      is_favorite: isFavorite,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "world_id,user_id" },
  );

  if (error) {
    console.error("[toggleWorldFavorite]", error.message);
    return;
  }

  revalidatePath("/", "layout");
}
