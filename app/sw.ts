/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }

  // lib.dom.d.ts n'a pas encore `image` dans NotificationOptions bien que ce
  // soit dans le spec Notifications API et supporté par les navigateurs
  // ciblés (Chrome/Edge/Android).
  interface NotificationOptions {
    image?: string;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// ── Web Push ────────────────────────────────────────────────────────────
// Indépendant de Serwist (qui ne gère ni "push" ni "notificationclick") —
// addEventListener est additif, aucun conflit avec serwist.addEventListeners().

type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  data?: { url?: string | null; notificationId?: string };
};

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  const payload = event.data.json() as PushPayload;
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon ?? "/icons/icon-192.png",
      badge: payload.badge ?? "/icons/badge-96.png",
      image: payload.image,
      data: payload.data,
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  // URL déjà calculée côté Edge Function (pushHref) — pas de recalcul ici.
  const url = (event.notification.data as PushPayload["data"] | undefined)?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Comparaison sur le pathname exact — .includes() matcherait à tort
      // "/w/1" à l'intérieur de "/w/10".
      for (const client of clients) {
        if ("focus" in client && new URL(client.url).pathname === url) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

// Balayer/fermer une notification (sans cliquer dessus) vaut "vu" — évite
// de devoir rouvrir l'app juste pour faire disparaître le badge associé.
// Best-effort : ne se déclenche pas de façon garantie sur toutes les
// plateformes (purge OS sans passer par le navigateur, app tuée…).
self.addEventListener("notificationclose", (event: NotificationEvent) => {
  const id = (event.notification.data as PushPayload["data"] | undefined)?.notificationId;
  if (!id) return;
  event.waitUntil(
    fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: id }),
      credentials: "same-origin",
    }).catch(() => {}),
  );
});
