import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLE } from "@/lib/constants";

/**
 * Détache cet appareil des notifications poussées.
 *
 * ── Pourquoi c'est indispensable à la déconnexion ────────────
 * `push_subscriptions` associe un POINT D'ACCÈS de navigateur à un compte. Le
 * point d'accès, lui, appartient au navigateur et survit à la déconnexion.
 *
 * Sans cet appel, quitter son compte laissait la ligne en place : le serveur
 * continuait d'envoyer les notifications de la personne partie vers ce
 * navigateur. Quelqu'un d'autre s'y connectant recevait donc les alertes de
 * son prédécesseur — titre et corps compris, soit l'aperçu de ses messages.
 *
 * À appeler AVANT `auth.signOut()` : la policy de suppression exige
 * `user_id = auth.uid()`, et la session est nécessaire pour l'satisfaire.
 *
 * Ne lève jamais : une déconnexion ne doit pas échouer parce qu'un
 * désabonnement a échoué. Au pire la ligne subsiste, ce qui est l'état
 * d'avant ce correctif.
 */
export async function detacherAppareilDuPush(supabase: SupabaseClient): Promise<void> {
  try {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    // La ligne d'abord, le navigateur ensuite — et seulement si la première a
    // bien disparu. Couper le navigateur sur une suppression échouée laisserait
    // le serveur viser indéfiniment un point d'accès que plus personne n'écoute.
    const { error } = await supabase
      .from(TABLE.PUSH_SUBSCRIPTIONS)
      .delete()
      .eq("endpoint", sub.endpoint);
    if (error) return;

    await sub.unsubscribe();
  } catch {
    // Silencieux : voir plus haut.
  }
}

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
