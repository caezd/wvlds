// lib/patreon/config.ts
// Configuration et constantes de l'intégration Patreon (côté serveur uniquement).
// Les secrets (client secret, webhook secret) ne doivent JAMAIS être importés
// dans un composant client.

export const PATREON_OAUTH_AUTHORIZE_URL = "https://www.patreon.com/oauth2/authorize";
export const PATREON_OAUTH_TOKEN_URL = "https://www.patreon.com/api/oauth2/token";
export const PATREON_IDENTITY_URL = "https://www.patreon.com/api/oauth2/v2/identity";

/** Scopes demandés : identité + liste des mécénats de l'utilisateur. */
export const PATREON_SCOPES = "identity identity.memberships";

export type PatreonConfig = {
  clientId: string;
  clientSecret: string;
  campaignId: string;
  webhookSecret: string;
  /** Palier minimum (en cents) pour être considéré « abonné ». */
  minCents: number;
  /** Doit correspondre EXACTEMENT à une Redirect URI enregistrée chez Patreon. */
  redirectUri: string;
};

/** URL publique du site, pour construire la redirect URI OAuth. */
function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Vrai si l'intégration Patreon est activée (feature flag env public). */
export function isPatreonEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PATREON_ENABLED === "true";
}

/**
 * Lit la config Patreon depuis l'environnement. Lève si une variable requise
 * manque — à n'appeler que dans du code serveur qui a besoin d'agir sur Patreon
 * (routes OAuth / webhook), pas au rendu de pages.
 */
export function getPatreonConfig(): PatreonConfig {
  const clientId = process.env.PATREON_CLIENT_ID;
  const clientSecret = process.env.PATREON_CLIENT_SECRET;
  const campaignId = process.env.PATREON_CAMPAIGN_ID;
  const webhookSecret = process.env.PATREON_WEBHOOK_SECRET;

  const missing = [
    ["PATREON_CLIENT_ID", clientId],
    ["PATREON_CLIENT_SECRET", clientSecret],
    ["PATREON_CAMPAIGN_ID", campaignId],
    ["PATREON_WEBHOOK_SECRET", webhookSecret],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(`Configuration Patreon incomplète : ${missing.join(", ")}`);
  }

  const minCents = Number.parseInt(process.env.PATREON_MIN_CENTS ?? "0", 10);

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    campaignId: campaignId!,
    webhookSecret: webhookSecret!,
    minCents: Number.isFinite(minCents) ? minCents : 0,
    redirectUri: `${siteUrl()}/auth/patreon/callback`,
  };
}
