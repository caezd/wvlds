import sharp from "sharp";

/**
 * Bannière et icône d'un monde pour l'image d'aperçu (app/api/og).
 *
 * Le moteur de `next/og` ne lit que PNG, JPEG, GIF et SVG ; les images des
 * mondes sont en WebP. On les télécharge, recadre et convertit ici, puis on
 * les passe en `data:` à la carte. Toute défaillance donne null : la carte se
 * rend alors sans l'image, jamais en erreur.
 *
 * Seul le stockage public de l'application est interrogé : une adresse
 * d'image reste une donnée saisie par un membre, et le serveur ne doit pas
 * aller chercher n'importe quelle adresse pour lui.
 */

/** Taille maximale d'une image téléchargée. */
const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 5000;

/** L'adresse si elle désigne une image publique du stockage Supabase, sinon null. */
export function ogImageSource(url: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!url || !base) return null;
  return url.startsWith(`${base}/storage/v1/object/public/`) ? url : null;
}

export type OgImageOptions = { width: number; height: number; format: "jpeg" | "png" };

/** L'image recadrée aux dimensions demandées, en `data:` ; null en cas d'échec. */
export async function loadOgImage(url: string | null | undefined, { width, height, format }: OgImageOptions) {
  const source = ogImageSource(url);
  if (!source) return null;
  try {
    const res = await fetch(source, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok || Number(res.headers.get("content-length")) > MAX_BYTES) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return null;
    const image = sharp(bytes).resize(width, height, { fit: "cover" });
    const out = await (format === "jpeg" ? image.jpeg({ quality: 82 }) : image.png()).toBuffer();
    return `data:image/${format};base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}
