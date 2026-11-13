import type { SupabaseClient } from "@supabase/supabase-js";

import { TABLE } from "@/lib/constants";

// Hors de tout module « use client » : la page d'un monde l'appelle côté
// serveur pour pré-remplir le bloc « Anniversaires », et le bloc lui-même au
// montage quand rien n'a été pré-rempli. Une fonction exportée par un module
// client n'est, vue du serveur, qu'une référence : l'appeler lève.

export type BirthdayMember = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  birthday_month: number;
  birthday_day: number;
};

/** Les membres du monde qui ont renseigné leur anniversaire, avec leur profil. */
export async function loadBirthdayMembers(supabase: SupabaseClient, worldId: string): Promise<BirthdayMember[]> {
  const { data: memberRows, error } = await supabase
    .from(TABLE.WORLD_MEMBERS)
    .select("user_id, birthday_month, birthday_day")
    .eq("world_id", worldId)
    .not("birthday_month", "is", null);
  if (error) console.error("[worldBirthdays] anniversaires illisibles :", error.message);
  type Row = { user_id: string; birthday_month: number; birthday_day: number };
  const rows = (memberRows ?? []) as Row[];
  if (rows.length === 0) return [];
  const { data: profileRows } = await supabase
    .from(TABLE.PROFILES)
    .select("id, username, avatar_url")
    .in("id", rows.map((r) => r.user_id));
  type ProfileRow = { id: string; username: string | null; avatar_url: string | null };
  const byId = new Map(((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    username: byId.get(r.user_id)?.username ?? null,
    avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
  }));
}
