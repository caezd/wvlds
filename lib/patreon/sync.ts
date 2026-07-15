// lib/patreon/sync.ts
// Écritures privilégiées de l'entitlement Patreon → base. Service_role only
// (contourne la RLS et les colonnes verrouillées de profiles). Partagé par le
// callback OAuth et le webhook.

import { createAdminClient } from "@/lib/supabase/admin";
import { getPatreonConfig } from "./config";
import { resolvePlan } from "./entitlement";
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

  // Plan courant (pour préserver lifetime).
  const { data: profile } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

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
  await admin.from("patreon_accounts").upsert(row, { onConflict: "user_id" });

  // patreon_managed reste false si le compte est lifetime (plan non piloté par
  // Patreon) ; true sinon (Patreon contrôle le basculement free/subscribed).
  await admin
    .from("profiles")
    .update({ plan, patreon_managed: plan !== "lifetime" })
    .eq("id", userId);

  return { plan };
}

/**
 * Délie le compte Patreon : supprime la ligne et rétrograde le plan à `free`
 * (sauf lifetime, préservé). Repasse `patreon_managed` à false.
 */
export async function disconnectPatreon(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("patreon_accounts").delete().eq("user_id", userId);

  const { data: profile } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

  const update =
    profile?.plan === "lifetime"
      ? { patreon_managed: false }
      : { plan: "free", patreon_managed: false };

  await admin.from("profiles").update(update).eq("id", userId);
}
