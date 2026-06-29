"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type WorldPrefsInput = {
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

export async function toggleFollowChatroom(
  chatroomId: string,
  follow: boolean,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (follow) {
    await supabase.from("chatroom_follows").upsert(
      { user_id: user.id, chatroom_id: chatroomId },
      { onConflict: "user_id,chatroom_id" },
    );
  } else {
    await supabase
      .from("chatroom_follows")
      .delete()
      .eq("user_id", user.id)
      .eq("chatroom_id", chatroomId);
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
