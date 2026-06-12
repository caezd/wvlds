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

function importAesKey(b64: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    fromB64(b64),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function toB64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromB64(b64: string): ArrayBuffer {
  const str = atob(b64);
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}
