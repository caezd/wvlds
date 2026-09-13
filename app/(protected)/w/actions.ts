"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ERR_NON_AUTHENTIFIE, echecEnregistrement } from "@/lib/actionErrors";
import { idSchema, parseInput } from "@/lib/inputSchemas";

// Strict : `prefs` est étalé dans l'upsert APRÈS `user_id`, donc une clé
// `user_id` glissée dans l'objet l'aurait remplacé. La RLS l'aurait refusé —
// mais autant ne jamais lui poser la question.
const worldPrefsSchema = z
  .strictObject({
    main_expanded: z.boolean(),
    is_favorite: z.boolean(),
    wiki_sidebar_width: z.number().int().min(0).max(4000),
    wiki_panel_width: z.number().int().min(0).max(4000),
  })
  .partial();

type WorldPrefsInput = z.input<typeof worldPrefsSchema>;

export async function saveWorldPrefs(
  worldId: string,
  prefs: WorldPrefsInput,
): Promise<void> {
  const input = parseInput(z.strictObject({ worldId: idSchema, prefs: worldPrefsSchema }), { worldId, prefs });
  if (!input.ok) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("world_user_preferences").upsert(
    {
      world_id: worldId,
      user_id: user.id,
      ...input.data.prefs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "world_id,user_id" },
  );

  if (error) {
    console.error("[saveWorldPrefs]", error.message);
  }
}

/**
 * L'appelant bascule l'étoile de façon optimiste : il lui faut savoir si
 * l'écriture a tenu. Cette action renvoyait `void` et avalait ses erreurs —
 * un refus laissait l'étoile allumée jusqu'au rechargement.
 */
export async function toggleFollowChatroom(
  chatroomId: string,
  follow: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: ERR_NON_AUTHENTIFIE };

  const { error } = follow
    ? await supabase.from("chatroom_follows").upsert(
        { user_id: user.id, chatroom_id: chatroomId },
        { onConflict: "user_id,chatroom_id" },
      )
    : await supabase
        .from("chatroom_follows")
        .delete()
        .eq("user_id", user.id)
        .eq("chatroom_id", chatroomId);

  if (error) return { ok: false, error: echecEnregistrement("toggleFollowChatroom", error) };
  return { ok: true };
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
