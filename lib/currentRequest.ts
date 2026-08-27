import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags, type FeatureFlags } from "@/lib/featureFlags";
import { getUserQuotaWithClient, type Plan, type Quota } from "@/lib/userQuota";
import type { World } from "@/types/worlds";
import type { WorldItem } from "@/components/sidebar/WorldPickerHeader";

/**
 * Getters mémoïsés pour la durée d'**une seule requête serveur** (`React cache()`).
 *
 * Le rendu d'une page (surtout `/w/[id]`) traverse plusieurs Server Components
 * — root layout, layout protégé, SidebarRail, sidebars — qui réclamaient chacun
 * l'utilisateur, son profil et les feature flags. Sans mémoïsation, ça faisait
 * par requête : ~3 `auth.getUser()` (aller-retour réseau de validation JWT),
 * 3-4 `select profiles` et 2 `select feature_flags`, tous en série → ~1,8 s de
 * TTFB observé. Ici chacun n'est plus exécuté **qu'une fois** et le résultat est
 * partagé dans tout l'arbre.
 */

export type CurrentProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  appear_offline: boolean | null;
  plan: string | null;
  is_admin: boolean | null;
  locale: string | null;
  message_font: string | null;
  message_text_size: string | null;
  message_text_align: string | null;
};

export type CurrentAuth = { id: string; email: string | null };

/** Claims JWT de la session — vérification locale de signature (sans réseau), mémoïsée. */
const getClaimsCached = cache(async (): Promise<{ sub?: string; email?: string } | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims as { sub?: string; email?: string } | undefined) ?? null;
});

/** Identité courante (id + email) issue des claims, mémoïsée. */
export const getCurrentAuth = cache(async (): Promise<CurrentAuth | null> => {
  const claims = await getClaimsCached();
  return claims?.sub ? { id: claims.sub, email: claims.email ?? null } : null;
});

/** Id de l'utilisateur courant — claims locaux (sans réseau), mémoïsé. */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  return (await getClaimsCached())?.sub ?? null;
});

/**
 * Profil courant — une seule requête `profiles` (union des colonnes utilisées
 * par le root layout, le layout protégé et SidebarRail), mémoïsée.
 */
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, appear_offline, plan, is_admin, locale, message_font, message_text_size, message_text_align")
    .eq("id", userId)
    .single();
  return (data as CurrentProfile) ?? null;
});

/** Feature flags — une seule requête `feature_flags`, mémoïsée. */
export const getCachedFeatureFlags = cache(async (): Promise<FeatureFlags> => {
  const supabase = await createClient();
  return getFeatureFlags(supabase);
});

export type WorldWithMembership = World & {
  owner_id: string;
  world_members: { user_id: string; role: string; age_confirmed_at: string | null }[];
};

/**
 * Ligne `worlds` (+ `world_members` pour la résolution de rôle), mémoïsée
 * par `worldId` pour la durée de la requête — `/w/[id]` et `WorldSidebar`
 * la chargeaient chacun séparément avec un jeu de colonnes quasi identique.
 */
export const getWorldById = cache(async (worldId: string): Promise<WorldWithMembership | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("worlds")
    .select(
      "id, name, description, owner_id, banner_url, icon_url, color, visibility, restrict_inventory, restrict_skills, enable_inventory, enable_skills, enable_faceclaims, allows_real_avatars, allows_illustrated_avatars, timeline_enabled, timeline_config, is_age_restricted, wiki_label, home_layout, announcement_html, announcement_size, home_grid, home_body_color, home_panel_color, home_show_stats, home_grid_gap, world_members(user_id, role, age_confirmed_at)",
    )
    .eq("id", worldId)
    .maybeSingle();
  return (data as WorldWithMembership | null) ?? null;
});

/**
 * Tous les mondes rejoints (membre ou propriétaire) par l'utilisateur courant,
 * mémoïsée — partagée entre le layout protégé (rail mondes mobile) et
 * `WorldSidebar` (sélecteur "Changer de monde").
 */
export const getUserWorlds = cache(async (): Promise<WorldItem[]> => {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const supabase = await createClient();
  // Deux requêtes séparées plutôt qu'un embed `world_user_preferences(is_favorite)`
  // filtré par `.eq("world_user_preferences.user_id", userId)` : ce filtre sur
  // une relation embarquée (même non-`!inner`) exclut les mondes sans ligne de
  // préférences (cas normal — la ligne n'est créée qu'au premier réglage), donc
  // amputait la liste des mondes rejoints n'ayant jamais eu de préférences.
  const [{ data }, { data: favorites }] = await Promise.all([
    supabase
      .from("worlds")
      .select("id, name, icon_url, owner_id, description, banner_url, color, visibility, restrict_inventory, restrict_skills, world_members!inner(user_id)")
      .eq("world_members.user_id", userId)
      .is("deleted_at", null)
      .eq("is_archived", false)
      .order("name"),
    supabase
      .from("world_user_preferences")
      .select("world_id")
      .eq("user_id", userId)
      .eq("is_favorite", true),
  ]);
  const favoriteIds = new Set((favorites ?? []).map((f: { world_id: string }) => f.world_id));
  return ((data ?? []) as WorldItem[]).map((world) => ({
    ...world,
    is_favorite: favoriteIds.has(world.id),
  }));
});

export type NavRoom = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  unread_count: number;
  category_id: string | null;
  last_poster_avatar_url: string | null;
  last_poster_id: string | null;
  participant_count: number;
  second_poster_avatar_url: string | null;
};

/**
 * Salons du monde pour la nav (`list_chatrooms_nav`), mémoïsée par `worldId`.
 *
 * C'est la requête la plus lourde du chemin chaud (agrégats de non-lus +
 * derniers posteurs) et elle était payée **deux fois** par rendu : le layout
 * monte `WorldSidebar`, la page monte `WorldHomeContent` (ou `ChatRoomContent`),
 * et chacun l'appelait pour son propre compte avec le même `p_world_id`.
 */
export const getChatroomsNav = cache(async (worldId: string): Promise<NavRoom[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_chatrooms_nav", { p_world_id: worldId });
  if (!error && data) return data as NavRoom[];
  // Repli défensif si le RPC est indisponible : liste nue, sans les agrégats
  // (non-lus, derniers posteurs). Vient de `ChatRoomContent`, où il vivait
  // en double — il couvre désormais les trois appelants.
  const { data: fallback } = await supabase
    .from("chatrooms")
    .select("id, title, name, icon_url, updated_at")
    .eq("world_id", worldId)
    .order("updated_at", { ascending: false });
  return ((fallback ?? []) as { id: string; title: string | null; name: string | null; icon_url: string | null; updated_at: string | null }[]).map((r) => ({
    id: r.id,
    title: r.title ?? null,
    name: r.name ?? null,
    icon_url: r.icon_url ?? null,
    last_message_at: r.updated_at ?? null,
    unread_count: 0,
    category_id: null,
    last_poster_avatar_url: null,
    last_poster_id: null,
    participant_count: 0,
    second_poster_avatar_url: null,
  }));
});

/**
 * Droits d'admin sur un monde (`is_world_admin`), mémoïsée par (worldId, userId).
 * Même motif que ci-dessus : `WorldSidebar` et `WorldHomeContent` la demandaient
 * séparément avec des arguments identiques.
 */
export const getIsWorldAdmin = cache(async (worldId: string, userId: string | null): Promise<boolean> => {
  if (!userId) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_world_admin", { wid: worldId, uid: userId });
  return !!data;
});

/**
 * Quota de mondes de l'utilisateur courant, mémoïsé.
 *
 * Réutilise le `plan` déjà chargé par `getCurrentProfile()` au lieu de relire
 * `profiles` : ce quota était calculé deux fois par rendu de page de monde
 * (layout protégé + `WorldSidebar`), soit deux `select plan` et deux `count`
 * de trop.
 */
export const getWorldsQuota = cache(async (): Promise<Quota> => {
  const [userId, profile] = await Promise.all([getCurrentUserId(), getCurrentProfile()]);
  if (!userId) return { plan: "free", owned: 0, quotaLimit: 1, quotaReached: false };
  const supabase = await createClient();
  return getUserQuotaWithClient(supabase, userId, "worlds", (profile?.plan as Plan | null) ?? null);
});

export type ChatroomCategory = {
  id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  icon_url: string | null;
  position: number;
};

/**
 * Catégories de salons d'un monde, mémoïsées par `worldId`.
 *
 * Sur `/w/[id]` elles étaient chargées deux fois : côté serveur par
 * `WorldSidebar`, puis **à nouveau côté client** par `WorldCategoryFolders` au
 * montage. Ce getter sert les deux, et le bloc d'accueil reçoit désormais ses
 * catégories en props initiales — il s'affiche donc au premier rendu au lieu
 * d'apparaître après un aller-retour réseau.
 */
export const getChatroomCategories = cache(async (worldId: string): Promise<ChatroomCategory[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chatroom_categories")
    .select("id, title, description, banner_url, icon_url, position")
    .eq("world_id", worldId)
    .order("position");
  return (data ?? []) as ChatroomCategory[];
});

/**
 * Salons suivis par l'utilisateur courant, mémoïsés.
 *
 * `WorldSidebar` chargeait déjà la liste complète pour afficher la section
 * « Suivi » ; `ChatRoomContent` relisait la même table pour la seule ligne du
 * salon courant. Sur `/c/[id]`, les deux partaient dans le même rendu — la
 * seconde est désormais dérivée de la première.
 */
export const getFollowedChatroomIds = cache(async (): Promise<Set<string>> => {
  const userId = await getCurrentUserId();
  if (!userId) return new Set();
  const supabase = await createClient();
  const { data } = await supabase
    .from("chatroom_follows")
    .select("chatroom_id")
    .eq("user_id", userId);
  return new Set(((data ?? []) as { chatroom_id: string }[]).map((r) => r.chatroom_id));
});

export type FavoriteWorld = { id: string; name: string; icon_url: string | null };

/**
 * Mondes épinglés par l'utilisateur courant (world_user_preferences.is_favorite),
 * mémoïsée — partagée entre les raccourcis du manifest PWA (`limit: 4`, Chrome
 * n'affiche de toute façon pas plus de raccourcis) et le panneau favoris du
 * rail d'icônes (`SidebarRail`, sans limite).
 */
export const getFavoriteWorlds = cache(async (limit?: number): Promise<FavoriteWorld[]> => {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const supabase = await createClient();
  let query = supabase
    .from("worlds")
    .select("id, name, icon_url, world_user_preferences!inner(is_favorite)")
    .eq("world_user_preferences.user_id", userId)
    .eq("world_user_preferences.is_favorite", true)
    .is("deleted_at", null)
    .eq("is_archived", false)
    .order("name");
  if (limit) query = query.limit(limit);
  const { data } = await query;
  return (data ?? []).map(({ id, name, icon_url }) => ({ id, name, icon_url }));
});
