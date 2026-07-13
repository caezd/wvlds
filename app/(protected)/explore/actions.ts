"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function joinPublicWorld(
  worldId: string,
  ageConfirmed = false,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase.rpc("join_public_world", {
    p_world_id: worldId,
    p_age_confirmed: ageConfirmed,
  });
  if (error) return { error: error.message };

  revalidatePath("/explore");
  return {};
}
