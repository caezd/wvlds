// lib/patreon/client.ts
// Client de l'API Patreon (OAuth2 + identity v2). Serveur uniquement.
// Les fonctions de PARSING (parseTokenResponse, parseIdentity) sont pures et
// exportées à part pour être testables sans réseau.

import {
  getPatreonConfig,
  PATREON_IDENTITY_URL,
  PATREON_OAUTH_AUTHORIZE_URL,
  PATREON_OAUTH_TOKEN_URL,
  PATREON_SCOPES,
} from "./config";
import type { PatronStatus } from "./entitlement";

// ── Types ────────────────────────────────────────────────────

export type PatreonTokens = {
  accessToken: string;
  refreshToken: string;
  /** Date d'expiration absolue de l'access token. */
  expiresAt: Date;
};

export type PatreonMembership = {
  /** Id Patreon de l'utilisateur (stable, sert de clé de liaison). */
  patreonUserId: string;
  patronStatus: PatronStatus;
  /** Montant courant auquel le mécène a droit sur NOTRE campagne, en cents. */
  entitledCents: number;
};

/** Forme (partielle) d'une réponse token OAuth de Patreon. */
type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

/** Forme (partielle) d'une réponse identity v2 (JSON:API). */
type IdentityResponse = {
  data?: { id?: string };
  included?: Array<{
    type?: string;
    attributes?: {
      patron_status?: string | null;
      currently_entitled_amount_cents?: number | null;
    };
    relationships?: {
      campaign?: { data?: { id?: string } | null };
    };
  }>;
};

/** Forme (partielle) d'un payload webhook Patreon (data = objet `member`). */
type WebhookPayload = {
  data?: {
    attributes?: {
      patron_status?: string | null;
      currently_entitled_amount_cents?: number | null;
    };
    relationships?: {
      user?: { data?: { id?: string } | null };
    };
  };
};

/** Normalise un patron_status brut vers notre union (inconnu → null). */
function normalizePatronStatus(raw: string | null | undefined): PatronStatus {
  return raw === "active_patron" || raw === "declined_patron" || raw === "former_patron"
    ? raw
    : null;
}

// ── Parsing pur (testable) ───────────────────────────────────

export function parseTokenResponse(json: TokenResponse): PatreonTokens {
  if (!json.access_token || !json.refresh_token) {
    throw new Error("Réponse token Patreon invalide : tokens manquants.");
  }
  const expiresInMs = (json.expires_in ?? 0) * 1000;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + expiresInMs),
  };
}

/**
 * Extrait le mécénat de l'utilisateur SUR NOTRE campagne depuis la réponse
 * identity. Si l'utilisateur n'est pas (ou plus) mécène de la campagne, renvoie
 * un statut null / 0 cents (→ résolu en `free` par resolvePlan).
 */
export function parseIdentity(json: IdentityResponse, campaignId: string): PatreonMembership {
  const patreonUserId = json.data?.id;
  if (!patreonUserId) {
    throw new Error("Réponse identity Patreon invalide : id utilisateur manquant.");
  }

  const member = (json.included ?? []).find(
    (item) =>
      item.type === "member" &&
      item.relationships?.campaign?.data?.id === campaignId,
  );

  return {
    patreonUserId,
    patronStatus: normalizePatronStatus(member?.attributes?.patron_status),
    entitledCents: member?.attributes?.currently_entitled_amount_cents ?? 0,
  };
}

/**
 * Extrait le mécénat depuis un payload WEBHOOK (events members:pledge:*).
 * Ici `data` est directement l'objet `member` ; l'id utilisateur Patreon est
 * dans la relation `user`.
 */
export function parseWebhookMember(json: WebhookPayload): PatreonMembership {
  const patreonUserId = json.data?.relationships?.user?.data?.id;
  if (!patreonUserId) {
    throw new Error("Payload webhook Patreon invalide : id utilisateur manquant.");
  }
  return {
    patreonUserId,
    patronStatus: normalizePatronStatus(json.data?.attributes?.patron_status),
    entitledCents: json.data?.attributes?.currently_entitled_amount_cents ?? 0,
  };
}

// ── Réseau ───────────────────────────────────────────────────

/** URL d'autorisation OAuth vers laquelle rediriger l'utilisateur. */
export function buildAuthorizeUrl(state: string): string {
  const cfg = getPatreonConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: PATREON_SCOPES,
    state,
  });
  return `${PATREON_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

async function requestToken(body: URLSearchParams): Promise<PatreonTokens> {
  const res = await fetch(PATREON_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Échec de l'échange de token Patreon (HTTP ${res.status}).`);
  }
  return parseTokenResponse(await res.json());
}

/** Échange le code d'autorisation OAuth contre des tokens. */
export function exchangeCode(code: string): Promise<PatreonTokens> {
  const cfg = getPatreonConfig();
  return requestToken(
    new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
    }),
  );
}

/** Rafraîchit un access token expiré à partir du refresh token. */
export function refreshAccessToken(refreshToken: string): Promise<PatreonTokens> {
  const cfg = getPatreonConfig();
  return requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  );
}

/** Récupère l'identité + le mécénat de l'utilisateur sur notre campagne. */
export async function fetchMembership(accessToken: string): Promise<PatreonMembership> {
  const cfg = getPatreonConfig();
  const url = new URL(PATREON_IDENTITY_URL);
  url.searchParams.set("include", "memberships.campaign");
  url.searchParams.set("fields[member]", "patron_status,currently_entitled_amount_cents");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Échec de la lecture de l'identité Patreon (HTTP ${res.status}).`);
  }
  return parseIdentity(await res.json(), cfg.campaignId);
}
