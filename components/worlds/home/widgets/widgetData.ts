import type { createClient } from "@/lib/supabase/client";
import { TABLE } from "@/lib/constants";

// ──────────────────────────────────────────────────────────────────────────
// Les lectures que deux mondes se partagent : le rendu serveur de l'accueil
// (`WorldHomeContent`, un composant serveur) et le bloc lui-même, qui charge
// seul quand il vient d'être ajouté à la grille sans rechargement de page.
//
// Elles vivaient dans les fichiers des blocs, marqués « use client ». Next y
// remplace chaque export par une référence client : appeler la fonction depuis
// le serveur lève « Attempted to call loadBirthdayMembers() from the server ».
// L'accueil d'un monde qui portait le bloc des anniversaires ne s'affichait
// plus du tout. Ici, aucune directive : le module se compile des deux côtés.
// ──────────────────────────────────────────────────────────────────────────

type Supabase = ReturnType<typeof createClient>;

/** Ce que le bloc sait d'une carte : de quoi la montrer et la compter. */
export type MapWidgetMap = {
  id: string;
  label: string;
  image_url: string | null;
  pin_count: number;
};

/**
 * Charge les cartes d'un monde et le nombre de lieux de chacune.
 *
 * Le compte se fait ici et non par une requête d'agrégat : PostgREST ne groupe
 * pas, et lire un identifiant par épingle reste dérisoire.
 */
export async function loadMapWidgetData(supabase: Supabase, worldId: string): Promise<MapWidgetMap[]> {
  const [{ data: maps }, { data: pins }] = await Promise.all([
    supabase
      .from("world_maps")
      .select("id, label, image_url")
      .eq("world_id", worldId)
      .order("sort_index"),
    supabase.from("world_map_pins").select("map_id").eq("world_id", worldId),
  ]);
  const parCarte = new Map<string, number>();
  for (const p of (pins ?? []) as { map_id: string }[]) {
    parCarte.set(p.map_id, (parCarte.get(p.map_id) ?? 0) + 1);
  }
  return ((maps ?? []) as Omit<MapWidgetMap, "pin_count">[]).map((m) => ({
    ...m,
    pin_count: parCarte.get(m.id) ?? 0,
  }));
}

/** Un membre dont l'anniversaire est connu, avec de quoi le nommer. */
export type BirthdayMember = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  birthday_month: number;
  birthday_day: number;
};

/** Les membres du monde qui ont renseigné leur anniversaire, avec leur profil. */
export async function loadBirthdayMembers(supabase: Supabase, worldId: string): Promise<BirthdayMember[]> {
  const { data: memberRows, error } = await supabase
    .from(TABLE.WORLD_MEMBERS)
    .select("user_id, birthday_month, birthday_day")
    .eq("world_id", worldId)
    .not("birthday_month", "is", null);
  if (error) console.error("[WorldBirthdaysWidget] anniversaires illisibles :", error.message);
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
