"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

/**
 * Retire l'utilisateur courant de world_members. La policy RLS
 * "members: self-leave" refuse déjà le départ du propriétaire — inutile de
 * revérifier ownership ici, l'erreur Postgres remonte telle quelle.
 */
export async function leaveWorld(worldId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Non authentifié" };

  const { error } = await supabase
    .from("world_members")
    .delete()
    .eq("world_id", worldId)
    .eq("user_id", user.id);
  if (error) return { ok: false as const, error: error.message };

  // Le cookie « dernier monde visité » pointerait sinon sur un monde qu'on
  // vient de quitter → 404 au prochain passage par /w (redirigé vers /).
  const cookieStore = await cookies();
  if (cookieStore.get("last_world_id")?.value === worldId) {
    cookieStore.delete("last_world_id");
  }

  revalidatePath("/", "layout");
  return { ok: true as const };
}
