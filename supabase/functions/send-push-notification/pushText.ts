// Aucune dépendance Deno/React ici : testable tel quel par Vitest.
// Miroir volontairement plat (sans balises <b>) de notifications.text.*
// dans messages/{fr,es,en}.json — cf. lib/notifHelpers.tsx::notifText pour
// l'équivalent riche côté client. Toute évolution des libellés doit être
// répercutée ICI aussi (un test de non-régression liste les 9 types, voir
// __tests__/pushText.test.ts, pour limiter le risque de dérive silencieuse).

export type PushLocale = "fr" | "en" | "es";

export type PushNotifPayload = {
  type:
    | "mention" | "reaction" | "new_member" | "new_chatroom" | "world_invite"
    | "chatroom_reply" | "persona_new_chatroom" | "persona_reply" | "marital_request";
  world_id: string | null;
  chat_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
};

const SOMEONE: Record<PushLocale, string> = { fr: "Quelqu'un", en: "Someone", es: "Alguien" };

function T(locale: PushLocale, fr: string, en: string, es: string): string {
  return locale === "en" ? en : locale === "es" ? es : fr;
}

export function buildPushText(n: PushNotifPayload, locale: PushLocale): { title: string; body: string } {
  const actor = n.actor_name ?? SOMEONE[locale];
  const count = typeof n.metadata?.count === "number" ? n.metadata.count : 1;
  const persona = typeof n.metadata?.persona_name === "string" ? n.metadata.persona_name : undefined;
  const title = "WVLDS";

  switch (n.type) {
    case "mention":
      return { title, body: n.content
        ? T(locale, `${actor} vous a mentionné dans ${n.content}`, `${actor} mentioned you in ${n.content}`, `${actor} le mencionó en ${n.content}`)
        : T(locale, `${actor} vous a mentionné`, `${actor} mentioned you`, `${actor} le mencionó`) };
    case "reaction":
      return { title, body: T(locale, `${actor} a réagi à votre message`, `${actor} reacted to your message`, `${actor} reaccionó a su mensaje`) };
    case "new_member":
      return { title, body: n.content
        ? T(locale, `${actor} a rejoint ${n.content}`, `${actor} joined ${n.content}`, `${actor} se unió a ${n.content}`)
        : T(locale, `${actor} a rejoint un monde`, `${actor} joined a world`, `${actor} se unió a un mundo`) };
    case "new_chatroom":
    case "persona_new_chatroom":
      return { title, body: n.content
        ? T(locale, `${actor} a créé ${n.content}`, `${actor} created ${n.content}`, `${actor} creó ${n.content}`)
        : T(locale, `${actor} a créé une chatroom`, `${actor} created a chatroom`, `${actor} creó una sala`) };
    case "world_invite":
      return { title, body: T(locale, `${actor} vous a invité à rejoindre un monde`, `${actor} invited you to a world`, `${actor} le invitó a un mundo`) };
    case "chatroom_reply":
      if (count > 1) {
        return { title, body: n.content
          ? T(locale, `${count} nouveaux messages dans ${n.content}`, `${count} new messages in ${n.content}`, `${count} mensajes nuevos en ${n.content}`)
          : T(locale, `${count} nouveaux messages`, `${count} new messages`, `${count} mensajes nuevos`) };
      }
      return { title, body: persona && n.content
        ? T(locale, `${actor} a répondu avec ${persona} dans ${n.content}`, `${actor} replied as ${persona} in ${n.content}`, `${actor} respondió como ${persona} en ${n.content}`)
        : n.content
          ? T(locale, `${actor} a répondu dans ${n.content}`, `${actor} replied in ${n.content}`, `${actor} respondió en ${n.content}`)
          : T(locale, `${actor} a répondu`, `${actor} replied`, `${actor} respondió`) };
    case "persona_reply":
      if (count > 1) {
        return { title, body: n.content
          ? T(locale, `${actor} a répondu ${count} fois dans ${n.content}`, `${actor} replied ${count} times in ${n.content}`, `${actor} respondió ${count} veces en ${n.content}`)
          : T(locale, `${actor} a répondu ${count} fois`, `${actor} replied ${count} times`, `${actor} respondió ${count} veces`) };
      }
      return { title, body: n.content
        ? T(locale, `${actor} a répondu dans ${n.content}`, `${actor} replied in ${n.content}`, `${actor} respondió en ${n.content}`)
        : T(locale, `${actor} a répondu`, `${actor} replied`, `${actor} respondió`) };
    case "marital_request": {
      const target = n.content ?? SOMEONE[locale];
      const married = n.metadata?.requested_status === "married";
      return { title, body: married
        ? T(locale, `${actor} souhaite marier son personnage à ${target}`, `${actor} wants to marry their character to ${target}`, `${actor} desea casar a su personaje con ${target}`)
        : T(locale, `${actor} souhaite mettre son personnage en couple avec ${target}`, `${actor} wants their character in a relationship with ${target}`, `${actor} desea poner en pareja a su personaje con ${target}`) };
    }
  }
}

export function pushHref(n: Pick<PushNotifPayload, "chat_id" | "world_id">): string | null {
  if (n.chat_id) return `/c/${n.chat_id}`;
  if (n.world_id) return `/w/${n.world_id}`;
  return null;
}

const PERSONA_TYPES = new Set<PushNotifPayload["type"]>(["persona_new_chatroom", "persona_reply", "marital_request"]);

// Miroir de la logique de NotifAvatar/isPersonaNotif dans
// components/notifications/index.tsx : pour les notifications "persona",
// l'avatar affiché est celui du persona (metadata.icon_url), pas celui du
// compte humain qui l'incarne.
export function resolvePushImage(n: PushNotifPayload, actorAvatarUrl: string | null): string | null {
  const isPersonaNotif = PERSONA_TYPES.has(n.type) || typeof n.metadata?.persona_name === "string";
  if (isPersonaNotif) {
    return typeof n.metadata?.icon_url === "string" ? n.metadata.icon_url : null;
  }
  return actorAvatarUrl;
}
