// Conversion de la clé publique VAPID (base64url) au format Uint8Array
// attendu par PushManager.subscribe({ applicationServerKey }).
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // `new Uint8Array(length)` (plutôt que Uint8Array.from) garantit un
  // ArrayBuffer non partagé — PushManager.subscribe l'exige explicitement
  // dans les lib DOM récentes (TS rejette Uint8Array<ArrayBufferLike>).
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
