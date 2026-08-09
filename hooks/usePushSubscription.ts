"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { urlBase64ToUint8Array } from "@/lib/push";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { TABLE } from "@/lib/constants";

/**
 * Abonnement Web Push pour CE navigateur/appareil. Le support (feature
 * detection) suffit à exclure Safari iOS hors mode standalone — pas besoin
 * de sniffer la plateforme, PushManager y est simplement absent tant que
 * l'app n'est pas installée (iOS 16.4+).
 */
export function usePushSubscription() {
  const { userId } = useCurrentUser();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ok = typeof window !== "undefined"
      && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setIsSubscribed(!!sub))
      .catch(() => {});
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported || !userId) return;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.error("NEXT_PUBLIC_VAPID_PUBLIC_KEY manquante — abonnement push impossible.");
      return;
    }
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      const supabase = createClient();
      await supabase.from(TABLE.PUSH_SUBSCRIPTIONS).upsert({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: json.keys!.p256dh,
        auth_key: json.keys!.auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });
      setIsSubscribed(true);
    } finally {
      // Dans le finally (pas juste après subscribe()) : si l'utilisateur
      // refuse la permission, subscribe() rejette et Notification.permission
      // passe quand même à "denied" côté navigateur — l'état local doit
      // refléter ce refus, pas rester figé sur sa valeur précédente.
      setPermission(Notification.permission);
      setLoading(false);
    }
  }, [supported, userId]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const supabase = createClient();
        await supabase.from(TABLE.PUSH_SUBSCRIPTIONS).delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, permission, isSubscribed, loading, subscribe, unsubscribe };
}
