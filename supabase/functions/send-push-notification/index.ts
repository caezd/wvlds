import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3";
import { buildPushText, pushHref, type PushLocale, type PushNotifPayload } from "./pushText.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const body = await req.json() as PushNotifPayload & { id: string; recipient_id: string };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const [{ data: subs, error: subsError }, { data: profile }] = await Promise.all([
    supabase.from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", body.recipient_id),
    supabase.from("profiles").select("locale").eq("id", body.recipient_id).single(),
  ]);

  // Une erreur de lecture (RLS, panne DB, …) ne doit jamais se confondre avec
  // "aucun abonnement" — sinon un vrai incident serait masqué et aucun
  // nettoyage d'abonnement invalide ne serait tenté ce cycle-ci.
  if (subsError) {
    console.error("push_subscriptions read error:", subsError.message);
    return Response.json({ ok: false, error: "subscriptions_read_failed" }, { status: 500 });
  }

  if (!subs || subs.length === 0) {
    return Response.json({ ok: true, sent: 0, removed: 0 });
  }

  // Configuré ici (pas au chargement du module) : une isolate warm ne doit
  // pas rester bloquée en erreur tant que les secrets VAPID ne sont pas
  // définis côté Supabase — et cette branche n'est atteinte que s'il y a
  // vraiment un envoi à faire.
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    console.error("VAPID secrets not configured (VAPID_SUBJECT/VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)");
    return Response.json({ ok: false, error: "vapid_not_configured" }, { status: 500 });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const locale = (profile?.locale ?? "fr") as PushLocale;
  const { title, body: text } = buildPushText(body, locale);
  const url = pushHref(body);
  const payload = JSON.stringify({
    title,
    body: text,
    icon: "/icons/icon-192.png",
    // Badge Android : image distincte, transparente, silhouette seule — l'OS
    // n'utilise que le canal alpha (masqué en blanc/couleur système). Un
    // fond plein comme icon-192.png donnerait un simple carré dans la barre
    // de statut.
    badge: "/icons/badge-96.png",
    data: { url, notificationId: body.id },
  });

  let sent = 0;
  const toRemove: string[] = [];

  await Promise.allSettled(subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth_key: string }) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        payload,
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 = abonnement révoqué/expiré côté navigateur.
      // 401/403 = clés VAPID invalides pour cet abonnement (compte push renouvelé).
      if (status === 404 || status === 410 || status === 401 || status === 403) {
        toRemove.push(s.id);
      } else {
        console.error("push send error:", status, err);
      }
    }
  }));

  if (toRemove.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", toRemove);
  }

  return Response.json({ ok: true, sent, removed: toRemove.length });
});
