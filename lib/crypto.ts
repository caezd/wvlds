// AES-256-GCM message encryption.
// Works in Node 18+ (server components) and in the browser (Web Crypto API).
// Encrypted values are prefixed with "enc:" so legacy plaintext passes through unchanged.

const ENC_PREFIX = "enc:";

export async function generateRoomKey(): Promise<string> {
  const key = await globalThis.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const raw = await globalThis.crypto.subtle.exportKey("raw", key);
  return toB64(raw);
}

export async function encryptMessage(plaintext: string, keyB64: string): Promise<string> {
  const key = await importAesKey(keyB64);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), 12);
  return ENC_PREFIX + toB64(combined.buffer as ArrayBuffer);
}

export async function decryptMessage(content: string, keyB64: string): Promise<string> {
  if (!content.startsWith(ENC_PREFIX)) return content; // plaintext legacy
  try {
    const key = await importAesKey(keyB64);
    const combined = new Uint8Array(fromB64(content.slice(ENC_PREFIX.length)));
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const plain = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ct,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return content;
  }
}

/**
 * Cache des clés importées, indexé par la clé base64 elle-même.
 *
 * `importAesKey` partait à *chaque* message : 50 appels `subtle.importKey` pour
 * afficher un salon, et bien plus pendant le scan progressif du centre de
 * recherche (lib/chatSearch.ts), qui déchiffre en masse à travers les salons.
 * L'import est pure dérivation depuis le même secret — le résultat est donc
 * réutilisable tel quel.
 *
 * On mémorise la *promesse*, pas la clé : deux déchiffrements lancés en
 * parallèle sur la même clé partagent alors un seul import au lieu d'en lancer
 * deux. Un import échoué est retiré du cache pour ne pas figer l'erreur.
 *
 * Le cache est borné et indexé par le secret : on ne peut en extraire une clé
 * qu'en fournissant déjà ce secret, il n'ouvre donc aucun accès. La `CryptoKey`
 * produite reste non exportable (`extractable: false`).
 */
const KEY_CACHE_MAX = 32;
const keyCache = new Map<string, Promise<CryptoKey>>();

function importAesKey(b64: string): Promise<CryptoKey> {
  const cached = keyCache.get(b64);
  if (cached) {
    // Réinsertion = marque de fraîcheur, pour que l'éviction ci-dessous retire
    // bien la clé la moins récemment utilisée (l'ordre d'une Map est celui
    // d'insertion).
    keyCache.delete(b64);
    keyCache.set(b64, cached);
    return cached;
  }

  const pending = globalThis.crypto.subtle
    .importKey("raw", fromB64(b64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
    .catch((err) => {
      keyCache.delete(b64);
      throw err;
    });

  keyCache.set(b64, pending);
  if (keyCache.size > KEY_CACHE_MAX) {
    const oldest = keyCache.keys().next().value;
    if (oldest !== undefined) keyCache.delete(oldest);
  }
  return pending;
}

/** Vide le cache des clés importées. Exposé pour les tests. */
export function __clearKeyCache(): void {
  keyCache.clear();
}

/**
 * Encode en base64, par morceaux.
 *
 * `String.fromCharCode(...octets)` passe TOUT le tableau en arguments. Au-delà
 * d'environ 125 000 octets, V8 lève `RangeError: Maximum call stack size
 * exceeded` — et le message ne part pas.
 *
 * Ce n'était pas hors d'atteinte : la base accepte 200 000 caractères de
 * contenu (migration 126), le composeur n'impose aucune limite, et un collage
 * suffit. Le seuil tombe d'ailleurs à ~31 000 caractères en émoji, qui pèsent
 * quatre octets chacun.
 *
 * 32 768 arguments par tour restent très en deçà de la limite du moteur, quelle
 * que soit la pression sur la pile au moment de l'appel.
 */
function toB64(buffer: ArrayBuffer): string {
  const octets = new Uint8Array(buffer);
  const MORCEAU = 0x8000;
  let binaire = "";
  for (let i = 0; i < octets.length; i += MORCEAU) {
    binaire += String.fromCharCode(...octets.subarray(i, i + MORCEAU));
  }
  return btoa(binaire);
}

function fromB64(b64: string): ArrayBuffer {
  const str = atob(b64);
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}
