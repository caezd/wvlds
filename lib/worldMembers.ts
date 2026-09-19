import type { SupabaseClient } from "@supabase/supabase-js";

import { TABLE } from "@/lib/constants";

/** Un membre du monde tel que la liste et l'autocomplétion des mentions le voient. */
export type WorldMemberRow = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  /** Identifiants des rôles portés, à résoudre contre `world_roles`. */
  role_ids: string[];
};

/**
 * Les membres d'un monde, avec leur profil et leurs rôles.
 *
 * Le propriétaire est toujours de la partie : sa ligne `world_members` existe
 * depuis le trigger de création, mais on ne s'y fie pas — un monde créé avant
 * ce trigger n'en aurait pas.
 */
export async function fetchWorldMembers(
  supabase: SupabaseClient,
  worldId: string,
  ownerId: string | null,
): Promise<WorldMemberRow[]> {
  const [{ data: memberRows, error: membersError }, { data: roleRows, error: rolesError }] = await Promise.all([
    supabase.from(TABLE.WORLD_MEMBERS).select("user_id").eq("world_id", worldId),
    supabase.from(TABLE.WORLD_MEMBER_ROLES).select("user_id, role_id").eq("world_id", worldId),
  ]);
  if (membersError) console.error("[fetchWorldMembers] membres illisibles :", membersError.message);
  if (rolesError) console.error("[fetchWorldMembers] rôles des membres illisibles :", rolesError.message);

  const ids = new Set(((memberRows ?? []) as { user_id: string }[]).map((m) => m.user_id));
  if (ownerId) ids.add(ownerId);
  const allIds = [...ids];
  if (allIds.length === 0) return [];

  const rolesByUser = new Map<string, string[]>();
  for (const r of (roleRows ?? []) as { user_id: string; role_id: string }[]) {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role_id);
    rolesByUser.set(r.user_id, list);
  }

  const { data: profileRows, error: profilesError } = await supabase
    .from(TABLE.PROFILES)
    .select("id, username, avatar_url")
    .in("id", allIds);
  if (profilesError) console.error("[fetchWorldMembers] profils illisibles :", profilesError.message);
  type ProfileRow = { id: string; username: string | null; avatar_url: string | null };
  const profileByUser = new Map(((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  return allIds.map((user_id) => {
    const profile = profileByUser.get(user_id);
    return {
      user_id,
      username: profile?.username ?? null,
      avatar_url: profile?.avatar_url ?? null,
      role_ids: rolesByUser.get(user_id) ?? [],
    };
  });
}
