"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { disconnectPatreon } from "@/lib/patreon/sync";
import { ERR_NON_AUTHENTIFIE , ERR_ENREGISTREMENT } from "@/lib/actionErrors";

/** Délie le compte Patreon de l'utilisateur courant et rétrograde le plan. */
export async function disconnectPatreonAccount() {
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId) return { error: ERR_NON_AUTHENTIFIE };

  try {
    await disconnectPatreon(userId);
  } catch (err) {
    console.error("Patreon disconnect error:", err);
    return { error: ERR_ENREGISTREMENT };
  }

  revalidatePath("/settings");
  return { success: true };
}
