import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getFeatureFlags, type FeatureFlags } from "@/lib/featureFlags";

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
    .select("id, username, avatar_url, appear_offline, plan, is_admin, locale")
    .eq("id", userId)
    .single();
  return (data as CurrentProfile) ?? null;
});

/** Feature flags — une seule requête `feature_flags`, mémoïsée. */
export const getCachedFeatureFlags = cache(async (): Promise<FeatureFlags> => {
  const supabase = await createClient();
  return getFeatureFlags(supabase);
});
