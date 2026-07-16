// lib/patreon/sync.ts
// Écritures privilégiées de l'entitlement Patreon → base. Service_role only
// (contourne la RLS et les colonnes verrouillées de profiles). Partagé par le
// callback OAuth et le webhook.

import { createAdminClient } from "@/lib/supabase/admin";
import { getPatreonConfig } from "./config";
import { resolvePlan } from "./entitlement";
import { refreshAccessToken, fetchMembership } from "./client";
import type { PatreonMembership, PatreonTokens } from "./client";

/** Levée quand le compte Patreon est déjà lié à un AUTRE utilisateur wvlds. */
export class PatreonAlreadyLinkedError extends Error {
  constructor() {
    super("Ce compte Patreon est déjà lié à un autre utilisateur.");
    this.name = "PatreonAlreadyLinkedError";
  }
}

/**
 * Upsert le lien Patreon et recalcule `profiles.plan`.
 * - `tokens` fourni par le callback OAuth ; absent au webhook (on conserve les
 *   tokens déjà en base).
 * - Préserve `lifetime` (via resolvePlan) ; `patreon_managed` reste false pour
 *   un lifetime (le plan n'est pas piloté par Patreon dans ce cas).
 */
export async function syncPatreonEntitlement(params: {
  userId: string;
  membership: PatreonMembership;
  tokens?: PatreonTokens;
}): Promise<{ plan: string }> {
  const { userId, membership, tokens } = params;
  const admin = createAdminClient();
  const { minCents } = getPatreonConfig();

  // Garde-fou : un compte Patreon ne peut être lié qu'à un seul compte wvlds.
  const { data: existing } = await admin
    .from("patreon_accounts")
    .select("user_id")
    .eq("patreon_user_id", membership.patreonUserId)
    .maybeSingle();
  if (existing && existing.user_id !== userId) {
    throw new PatreonAlreadyLinkedError();
  }

  // Plan courant (pour préserver lifetime). Erreur non tolérée : un échec
  // silencieux ferait traiter currentPlan comme null et pourrait écraser un
  // compte lifetime avec un plan Patreon incorrect.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();
  if (profileError) {
    throw new Error(`Impossible de lire le profil (${userId}) : ${profileError.message}`);
  }

  const plan = resolvePlan({
    patronStatus: membership.patronStatus,
    entitledCents: membership.entitledCents,
    currentPlan: profile?.plan ?? null,
    minCents,
  });

  const row: Record<string, unknown> = {
    user_id: userId,
    patreon_user_id: membership.patreonUserId,
    patron_status: membership.patronStatus,
    entitled_cents: membership.entitledCents,
    last_synced_at: new Date().toISOString(),
  };
  if (tokens) {
    row.access_token = tokens.accessToken;
    row.refresh_token = tokens.refreshToken;
    row.token_expires_at = tokens.expiresAt.toISOString();
  }
  const { error: upsertError } = await admin
    .from("patreon_accounts")
    .upsert(row, { onConflict: "user_id" });
  if (upsertError) {
    throw new Error(`Échec de l'enregistrement du lien Patreon (${userId}) : ${upsertError.message}`);
  }

  // patreon_managed reste false si le compte est lifetime (plan non piloté par
  // Patreon) ; true sinon (Patreon contrôle le basculement free/subscribed).
  const { error: updateError } = await admin
    .from("profiles")
    .update({ plan, patreon_managed: plan !== "lifetime" })
    .eq("id", userId);
  if (updateError) {
    throw new Error(`Échec de la mise à jour du plan (${userId}) : ${updateError.message}`);
  }

  return { plan };
}

/**
 * Délie le compte Patreon : supprime la ligne et rétrograde le plan à `free`
 * (sauf lifetime, préservé). Repasse `patreon_managed` à false.
 */
export async function disconnectPatreon(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error: deleteError } = await admin
    .from("patreon_accounts")
    .delete()
    .eq("user_id", userId);
  if (deleteError) {
    throw new Error(`Échec de la suppression du lien Patreon (${userId}) : ${deleteError.message}`);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();
  if (profileError) {
    throw new Error(`Impossible de lire le profil (${userId}) : ${profileError.message}`);
  }

  const update =
    profile?.plan === "lifetime"
      ? { patreon_managed: false }
      : { plan: "free", patreon_managed: false };

  const { error: updateError } = await admin.from("profiles").update(update).eq("id", userId);
  if (updateError) {
    throw new Error(`Échec de la mise à jour du plan (${userId}) : ${updateError.message}`);
  }
}

/**
 * Rafraîchit le token d'un compte et resynchronise son mécénat.
 * Toujours un refresh : Patreon renvoie un nouveau couple access/refresh, ce qui
 * évite de gérer l'expiration au cas par cas et garde les tokens frais.
 */
async function resyncOnePatreonAccount(userId: string, refreshToken: string): Promise<void> {
  const tokens = await refreshAccessToken(refreshToken);
  const membership = await fetchMembership(tokens.accessToken);
  await syncPatreonEntitlement({ userId, membership, tokens });
}

/**
 * Filet de sécurité (cron) : re-synchronise les comptes Patreon dont la dernière
 * synchro remonte à plus de `staleHours`, pour rattraper un webhook manqué.
 * Isolé par compte — l'échec de l'un (token révoqué, etc.) n'interrompt pas les autres.
 */
export async function resyncStalePatreonAccounts(
  opts: { staleHours?: number; limit?: number } = {},
): Promise<{ processed: number; errors: number }> {
  const staleHours = opts.staleHours ?? 12;
  const limit = opts.limit ?? 100;
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - staleHours * 3_600_000).toISOString();

  const { data: accounts, error: selectError } = await admin
    .from("patreon_accounts")
    .select("user_id, refresh_token")
    .lt("last_synced_at", cutoff)
    .order("last_synced_at", { ascending: true })
    .limit(limit);
  // Distinct d'un vrai "rien à faire" : une panne de lecture ne doit pas se
  // faire passer pour { processed: 0, errors: 0 } auprès du cron.
  if (selectError) {
    throw new Error(`Impossible de lister les comptes Patreon à resynchroniser : ${selectError.message}`);
  }

  let processed = 0;
  let errors = 0;
  for (const acc of accounts ?? []) {
    try {
      await resyncOnePatreonAccount(acc.user_id as string, acc.refresh_token as string);
      processed++;
    } catch (err) {
      errors++;
      console.error("Patreon resync error for user", acc.user_id, err);
    }
  }
  return { processed, errors };
}
