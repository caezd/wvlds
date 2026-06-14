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
  const clean = url.split("?")[0];
  if (!clean.includes("/storage/v1/object/public/")) return url;
  // imgproxy (used by Supabase) fails on certain PNG variants (16-bit, ICC profiles, CMYK)
  if (/\.png$/i.test(clean)) return url;
  const h = height ? `&height=${height}` : "";
  return (
    clean.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
    `?width=${width}${h}&quality=${quality}&resize=${resize}`
  );
}

/**
 * Retourne l'URL propre (sans param ?t=) pour stockage en DB.
 * Le param ?t= ne doit être utilisé qu'en mémoire pour invalider
 * le cache navigateur immédiatement après un upload.
 */
export function cleanStorageUrl(url: string): string {
  return url.split("?")[0];
}
