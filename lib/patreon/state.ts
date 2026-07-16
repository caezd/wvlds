// lib/patreon/state.ts
// Paramètre `state` OAuth signé, lié à l'utilisateur — anti-CSRF / anti-vol de
// compte. On signe { uid, iat, nonce } en HMAC-SHA256 avec le client secret
// Patreon (déjà côté serveur). Le callback re-vérifie la signature ET que la
// session courante correspond bien à `uid`.

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { getPatreonConfig } from "./config";

/** Durée de validité du state (le temps de faire l'aller-retour OAuth). */
const MAX_AGE_MS = 10 * 60 * 1000;

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/** Produit un state signé pour l'utilisateur donné. */
export function signState(userId: string): string {
  const secret = getPatreonConfig().clientSecret;
  const payload = JSON.stringify({
    uid: userId,
    iat: Date.now(),
    n: randomBytes(8).toString("hex"),
  });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Vérifie un state et renvoie l'userId qu'il porte, ou null si invalide
 * (signature incorrecte, format cassé, ou expiré).
 */
export function verifyState(state: string | null | undefined): { userId: string } | null {
  if (!state) return null;
  const secret = getPatreonConfig().clientSecret;
  const [payloadB64, sig] = state.split(".");
  if (!payloadB64 || !sig) return null;

  const expected = sign(payloadB64, secret);
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof parsed?.uid !== "string" || typeof parsed?.iat !== "number") return null;
    if (Date.now() - parsed.iat > MAX_AGE_MS) return null;
    return { userId: parsed.uid };
  } catch {
    return null;
  }
}
