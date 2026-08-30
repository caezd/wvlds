/**
 * Convertit une URL Supabase Storage publique en URL de transformation
 * pour charger une version redimensionnée côté serveur.
 *
 * Avant : .../storage/v1/object/public/bucket/path
 * Après  : .../storage/v1/render/image/public/bucket/path?width=W&quality=Q
 *
 * Si l'URL n'est pas une URL Supabase Storage, elle est retournée telle quelle.
 */
export function supabaseThumb(
  url: string | null | undefined,
  width: number,
  quality = 80,
  height?: number,
  resize: "contain" | "cover" | "fill" = "contain",
): string | undefined {
  if (!url) return undefined;
  const qIdx = url.indexOf("?");
  const clean = qIdx >= 0 ? url.slice(0, qIdx) : url;
  const qs = qIdx >= 0 ? url.slice(qIdx + 1) : "";
  const t = qs ? new URLSearchParams(qs).get("t") : null;
  if (!clean.includes("/storage/v1/object/public/")) return url;
  // imgproxy (used by Supabase) fails on certain PNG variants (16-bit, ICC profiles, CMYK)
  if (/\.png$/i.test(clean)) return url;
  const h = height ? `&height=${height}` : "";
  const bust = t ? `&t=${t}` : "";
  return (
    clean.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
    `?width=${width}${h}&quality=${quality}&resize=${resize}${bust}`
  );
}

/** Largeur de la vignette de substitution affichée floutée en attendant
 *  l'image réelle. Assez petite pour arriver en quelques centaines d'octets,
 *  assez grande pour restituer les masses de couleur de l'image. */
export const TINY_THUMB_WIDTH = 16;

/**
 * Vignette minuscule d'une image stockée, ou `undefined` quand l'URL ne peut
 * pas être transformée.
 *
 * `supabaseThumb` renvoie l'URL telle quelle dans deux cas : un PNG (imgproxy
 * échoue sur certaines variantes) et une URL hors bucket public. S'en servir
 * comme substitut téléchargerait alors l'image ENTIÈRE une seconde fois —
 * l'exact inverse du but recherché. D'où la comparaison ci-dessous : pas de
 * transformation, pas de substitut.
 */
export function supabaseTinyThumb(
  url: string | null | undefined,
  height?: number,
): string | undefined {
  const tiny = supabaseThumb(url, TINY_THUMB_WIDTH, 40, height);
  return tiny && tiny !== url ? tiny : undefined;
}

/**
 * Retourne l'URL propre (sans param ?t=) pour stockage en DB.
 * Le param ?t= ne doit être utilisé qu'en mémoire pour invalider
 * le cache navigateur immédiatement après un upload.
 */
export function cleanStorageUrl(url: string): string {
  return url.split("?")[0];
}
