"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ERR_NON_AUTHENTIFIE, echecEnregistrement } from "@/lib/actionErrors";

export async function joinPublicWorld(
  worldId: string,
  ageConfirmed = false,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: ERR_NON_AUTHENTIFIE };

  const { error } = await supabase.rpc("join_public_world", {
    p_world_id: worldId,
    p_age_confirmed: ageConfirmed,
  });
  if (error) return { error: echecEnregistrement("joinPublicWorld", error) };

  revalidatePath("/explore");
  return {};
}
