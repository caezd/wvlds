/**
 * Aperçu public d'un monde partagé par lien (migration 267).
 *
 * Un lien /w/<id> ou /c/<id> ouvert sans session mène à la connexion avec
 * `?next=<le lien>`. La page de connexion montre alors le monde visé, puis y
 * renvoie une fois connecté ; les robots d'aperçu, qui suivent la même
 * redirection, en tirent titre, description et image.
 *
 * Ce module ne fait que lire et valider : `next` vient de l'adresse, donc du
 * visiteur, et la réponse de la base est traitée comme une donnée.
 */

/** Paramètre de la page de connexion qui porte le lien d'origine. */
export const NEXT_PARAM = "next";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SHARE_RE = new RegExp(`^/(w|c)/(${UUID})(?:[/?#]|$)`, "i");

export type ShareTarget = { kind: "world" | "chatroom"; id: string };

export type SharePreview = {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  color: string | null;
  ageRestricted: boolean;
  memberCount: number;
  /** Nom du salon visé, s'il est ouvert ou public ; null sinon. */
  chatroomName: string | null;
  /** Monde privé : la base n'en donne que le nom (migration 268). */
  isPrivate: boolean;
};

/**
 * Le chemin où revenir après la connexion, s'il est bien interne au site.
 *
 * `//hote` et `/\hote` sont lus par les navigateurs comme une autre origine :
 * refusés, comme tout ce qui ne commence pas par une seule barre. Les pages de
 * connexion elles-mêmes aussi, pour ne pas tourner en rond.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (typeof next !== "string" || !next.startsWith("/")) return null;
  if (next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  if (next === "/auth" || next.startsWith("/auth/") || next.startsWith("/auth?")) return null;
  return next;
}

/** Monde ou salon visé par le lien d'origine ; null pour tout autre chemin. */
export function shareTargetFromNext(next: string | null | undefined): ShareTarget | null {
  const path = safeNextPath(next);
  const m = path ? SHARE_RE.exec(path) : null;
  if (!m) return null;
  return { kind: m[1].toLowerCase() === "w" ? "world" : "chatroom", id: m[2].toLowerCase() };
}

const texte = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const https = (v: unknown): string | null => {
  const s = texte(v);
  return s && /^https:\/\//i.test(s) ? s : null;
};

/** La réponse de `get_world_share_preview`, ou null si rien n'est à montrer. */
export function parseSharePreview(data: unknown): SharePreview | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const id = texte(d.id);
  const name = texte(d.name);
  if (!id || !name) return null;
  if (d.private === true) {
    return {
      id,
      name,
      description: null,
      iconUrl: null,
      bannerUrl: null,
      color: null,
      ageRestricted: false,
      memberCount: 0,
      chatroomName: null,
      isPrivate: true,
    };
  }
  const count = Number(d.member_count);
  return {
    id,
    name,
    description: texte(d.description),
    iconUrl: https(d.icon_url),
    bannerUrl: https(d.banner_url),
    color: typeof d.color === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(d.color) ? d.color : null,
    ageRestricted: d.age_restricted === true,
    memberCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
    chatroomName: texte(d.chatroom_name),
    isPrivate: false,
  };
}

export type WorldCardContent = { name: string; meta: string; excerpt: string | null; locked: boolean };

/** Longueur maximale de l'extrait : deux lignes sous le nom et l'icône, dans l'image. */
const EXTRAIT_MAX = 150;

/**
 * L'extrait de la description montré sous le nom : sur une ligne, coupé entre
 * deux mots, sans ponctuation avant les points de suspension.
 */
export function descriptionExcerpt(description: string | null | undefined): string | null {
  const plat = (description ?? "").replace(/\s+/g, " ").trim();
  if (!plat) return null;
  if (plat.length <= EXTRAIT_MAX) return plat;
  const coupe = plat.slice(0, EXTRAIT_MAX);
  const espace = coupe.lastIndexOf(" ");
  const debut = espace > EXTRAIT_MAX / 2 ? coupe.slice(0, espace) : coupe;
  return `${debut.replace(/[\s.,;:!?…·—–-]+$/u, "")}…`;
}

/**
 * La carte d'un monde dans l'image d'aperçu : son nom, au-dessus ses membres
 * — ou « Monde privé · sur invitation » —, en dessous un extrait de sa
 * description (jamais pour un 18+ : la base ne l'envoie pas). Un monde privé a un cadenas
 * à la place de l'icône : la base n'en donne que le nom. Un monde 18+ est un
 * monde public comme un autre. Le lien d'un salon montre la carte de son monde.
 */
export function worldCardContent(
  p: SharePreview,
  labels: { privateWorld: string; members: (count: number) => string },
): WorldCardContent {
  if (p.isPrivate) return { name: p.name, meta: labels.privateWorld, excerpt: null, locked: true };
  return { name: p.name, meta: labels.members(p.memberCount), excerpt: descriptionExcerpt(p.description), locked: false };
}

/**
 * Version de la mise en page des images d'aperçu (lib/ogCard). À augmenter à
 * chaque changement visible : Discord et les autres gardent une image en
 * cache selon son adresse, très longtemps, sans la redemander.
 */
export const OG_LAYOUT_VERSION = 4;

/**
 * La version de l'image d'un monde, posée dans son adresse (`&v=`) : elle
 * change avec la mise en page et avec ce que l'image montre — nom,
 * description, icône, bannière (leurs adresses changent à chaque envoi),
 * membres, visibilité. Pas avec le salon : un lien de salon montre l'image
 * de son monde. Empreinte FNV-1a, en base 36.
 */
export function ogImageVersion(p: SharePreview): string {
  const source = JSON.stringify([
    OG_LAYOUT_VERSION,
    p.name,
    p.description,
    p.iconUrl,
    p.bannerUrl,
    p.memberCount,
    p.isPrivate,
    p.ageRestricted,
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
