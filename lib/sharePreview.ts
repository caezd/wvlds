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
  };
}

/** Textes de l'image d'aperçu d'un monde ; le lien d'un salon montre celle de son monde. */
export function shareCardContent(
  p: SharePreview,
  labels: { publicWorld: string; ageRestricted: string },
): { surtitle: string; title: string; subtitle: string | null } {
  return {
    surtitle: p.ageRestricted ? `${labels.publicWorld} · ${labels.ageRestricted}` : labels.publicWorld,
    title: p.name,
    subtitle: p.description,
  };
}
