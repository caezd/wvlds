// lib/patreon/signature.ts
// Vérification de la signature des webhooks Patreon.
// Patreon signe le CORPS BRUT de la requête en HMAC-MD5 avec le secret du
// webhook, et transmet le digest hex dans l'en-tête `X-Patreon-Signature`.
// Serveur uniquement (dépend de node:crypto + du secret).

import { createHmac, timingSafeEqual } from "node:crypto";

/** Nom de l'en-tête HTTP portant la signature. */
export const PATREON_SIGNATURE_HEADER = "x-patreon-signature";

/** Calcule la signature attendue (HMAC-MD5 hex) du corps brut. */
export function computeWebhookSignature(rawBody: string, secret: string): string {
  return createHmac("md5", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * Vérifie qu'une requête webhook provient bien de Patreon.
 * Comparaison à temps constant pour éviter les attaques temporelles.
 *
 * @returns true si la signature correspond, false sinon (header absent,
 *          longueur différente ou digest incorrect).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature) return false;

  const expected = computeWebhookSignature(rawBody, secret);
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(signature, "utf8");

  // timingSafeEqual exige des longueurs égales : une longueur différente est
  // de toute façon un rejet.
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
