"use server";

import { createClient } from "@/lib/supabase/server";
import type { ChatroomCategory } from "@/types/worlds";

export async function addChatroomCategory(
  worldId: string,
  data: { title: string; description?: string | null; banner_url?: string | null; icon_url?: string | null },
) {
  const supabase = await createClient();

  const { data: maxRow, error: maxErr } = await supabase
    .from("chatroom_categories")
    .select("position")
    .eq("world_id", worldId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) return { ok: false as const, error: maxErr.message };

  const position = (maxRow?.position ?? -1) + 1;

  const { data: category, error } = await supabase
    .from("chatroom_categories")
    .insert({ world_id: worldId, position, ...data })
    .select()
    .single();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, category: category as ChatroomCategory };
}

export async function updateChatroomCategory(
  id: string,
  data: Partial<{ title: string; description: string | null; banner_url: string | null; icon_url: string | null }>,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chatroom_categories")
    .update(data)
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deleteChatroomCategory(
  id: string,
  bannerUrl: string | null,
  iconUrl?: string | null,
) {
  const supabase = await createClient();

  // La LIGNE d'abord, les fichiers ensuite.
  //
  // L'ordre inverse effaçait les images avant de savoir si la catégorie
  // partirait vraiment. Une suppression refusée — la RLS réserve
  // `chatroom_categories` aux éditeurs du monde — laissait alors la catégorie
  // en place, mais dépouillée de sa bannière et de son icône, sans que rien ne
  // le signale : à l'écran, une catégorie aux images cassées.
  //
  // Dans ce sens-ci, un échec du retrait des fichiers ne laisse que des
  // fichiers orphelins dans l'espace de stockage — invisibles, et sans effet
  // sur ce que voit l'utilisateur.
  const { error } = await supabase
    .from("chatroom_categories")
    .delete()
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  const paths = [bannerUrl, iconUrl]
    .filter((url): url is string => !!url)
    .map((url) => {
      try {
        const pathname = new URL(url).pathname;
        const marker = "/chatroom-categories/";
        const idx = pathname.indexOf(marker);
        if (idx === -1) return null;
        return pathname.slice(idx + marker.length);
      } catch {
        const [, rest] = url.split("/chatroom-categories/");
        return rest?.split("?")[0] ?? null;
      }
    })
    .filter((path): path is string => !!path);
  if (paths.length) await supabase.storage.from("chatroom-categories").remove(paths);

  return { ok: true as const };
}

export async function reorderChatroomCategories(
  categories: { id: string; position: number }[],
) {
  const supabase = await createClient();

  const results = await Promise.all(
    categories.map(({ id, position }) =>
      supabase.from("chatroom_categories").update({ position }).eq("id", id),
    ),
  );

  const firstError = results.find((r) => r.error)?.error;
  if (firstError) return { ok: false as const, error: firstError.message };

  return { ok: true as const };
}
