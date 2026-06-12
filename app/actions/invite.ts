"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Role = "admin" | "editor" | "player" | "viewer";

export async function inviteUserToWorld(
  email: string,
  worldId: string,
  role: Role
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return { error: "Non authentifié." };

  const admin = createAdminClient();

  // Pas de redirectTo : Supabase utilise le Site URL configuré dans le dashboard
  // (https://wvlds.vercel.app). Le middleware renverra vers /auth/login, qui
  // détecte type=invite dans le fragment et redirige vers /auth/invite.
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_world_id: worldId, invited_role: role },
  });

  if (error) return { error: error.message };
  return {};
}
