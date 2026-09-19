import type { SupabaseClient } from "@supabase/supabase-js";

import { RPC, TABLE } from "@/lib/constants";
import type { WorldMemberStatus } from "@/types/db";

/** La carte d'un membre dans ce monde — colonnes de la migration 177. */
export type WorldMemberCardFields = {
  status: WorldMemberStatus;
  status_until: string | null;
  status_note: string | null;
  bio: string | null;
  availability: string | null;
  timezone: string | null;
  birthday_month: number | null;
  birthday_day: number | null;
};

export const MEMBER_CARD_COLUMNS =
  "user_id, status, status_until, status_note, bio, availability, timezone, birthday_month, birthday_day";

/** Un membre du monde tel que la liste et l'autocomplétion des mentions le voient. */
export type WorldMemberRow = WorldMemberCardFields & {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  /** Identifiants des rôles portés, à résoudre contre `world_roles`. */
  role_ids: string[];
};

const EMPTY_CARD: WorldMemberCardFields = {
  status: "active",
  status_until: null,
  status_note: null,
  bio: null,
  availability: null,
  timezone: null,
  birthday_month: null,
  birthday_day: null,
};

/** Un statut « en pause » ou « absent » dont la date de retour est passée vaut « actif ». */
export function effectiveStatus(
  m: Pick<WorldMemberCardFields, "status" | "status_until">,
  now: Date = new Date(),
): WorldMemberStatus {
  if (m.status === "active") return "active";
  if (m.status_until && new Date(`${m.status_until}T23:59:59`) < now) return "active";
  return m.status;
}

/**
 * Les membres d'un monde, avec leur profil, leurs rôles et leur carte.
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
    supabase.from(TABLE.WORLD_MEMBERS).select(MEMBER_CARD_COLUMNS).eq("world_id", worldId),
    supabase.from(TABLE.WORLD_MEMBER_ROLES).select("user_id, role_id").eq("world_id", worldId),
  ]);
  if (membersError) console.error("[fetchWorldMembers] membres illisibles :", membersError.message);
  if (rolesError) console.error("[fetchWorldMembers] rôles des membres illisibles :", rolesError.message);

  type MemberRow = { user_id: string } & Partial<WorldMemberCardFields>;
  const cardByUser = new Map<string, MemberRow>(((memberRows ?? []) as MemberRow[]).map((m) => [m.user_id, m]));
  const ids = new Set(cardByUser.keys());
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
    const card = cardByUser.get(user_id);
    return {
      ...EMPTY_CARD,
      ...(card ?? {}),
      user_id,
      username: profile?.username ?? null,
      avatar_url: profile?.avatar_url ?? null,
      role_ids: rolesByUser.get(user_id) ?? [],
    };
  });
}

export type WorldMemberActivity = { message_count: number; last_message_at: string | null };

/** Messages et dernière prise de parole, par membre (RPC `get_world_member_activity`). */
export async function fetchWorldMemberActivity(
  supabase: SupabaseClient,
  worldId: string,
): Promise<Map<string, WorldMemberActivity>> {
  const { data, error } = await supabase.rpc(RPC.GET_WORLD_MEMBER_ACTIVITY, { p_world_id: worldId });
  if (error) {
    console.error("[fetchWorldMemberActivity] activité illisible :", error.message);
    return new Map();
  }
  type Row = { user_id: string; message_count: number | string; last_message_at: string | null };
  return new Map(
    ((data ?? []) as Row[]).map((r) => [
      r.user_id,
      { message_count: Number(r.message_count), last_message_at: r.last_message_at },
    ]),
  );
}
