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

/**
 * Deux paliers de largeur pour les avatars, au lieu d'une largeur calculée à
 * partir de la taille d'affichage de chaque surface.
 *
 * Calculer `taille × 3` par surface produit une URL différente par vue — 384
 * pour une fiche, 480 pour une grille, 600 pour une carte — donc un
 * téléchargement par vue pour le MÊME avatar. Le cache du navigateur n'y peut
 * rien : on ne lui redemande jamais la même URL. Deux paliers suffisent à ce
 * que toutes les vues d'une même famille partagent leur image.
 *
 * Deux et pas un seul : servir 512 px à l'avatar de 32 px d'un message
 * multiplierait par vingt le poids d'un fil de discussion. Le seuil est à
 * 44 px CSS, soit 132 px sur un écran 3x — juste au-dessus du petit palier.
 */
export const AVATAR_THUMB_SMALL = 128;
export const AVATAR_THUMB_LARGE = 512;

/** Palier à demander pour un avatar affiché à `cssSize` pixels. */
export function avatarThumbWidth(cssSize: number): number {
  return cssSize <= 44 ? AVATAR_THUMB_SMALL : AVATAR_THUMB_LARGE;
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
 * Palier de largeur à demander pour une image affichée à `displayedWidth`.
 *
 * Rend le plus petit palier qui suffise, ou `null` quand aucun ne suffit — il
 * faut alors l'original. Des paliers, et non la largeur exacte : celle-ci
 * diffère à chaque écran et à chaque cran de zoom, donc une URL par visiteur,
 * donc un téléchargement par visiteur. Le cache du navigateur ne peut rien pour
 * une image qu'on ne lui redemande jamais à l'identique.
 */
export function widthTierFor(displayedWidth: number, tiers: number[]): number | null {
  for (const tier of tiers) if (displayedWidth <= tier) return tier;
  return null;
}

/**
 * Chemin d'un objet dans son bucket, à partir de son URL publique.
 *
 * Sert au ménage : ce que l'application garde d'un fichier téléversé, c'est son
 * URL, pas son chemin. Sans ce chemin, `storage.remove()` n'a rien à effacer et
 * les images des cartes et des lieux supprimés s'entassent indéfiniment.
 *
 * Rend `null` plutôt qu'une chaîne douteuse quand l'URL ne vient pas du bucket
 * attendu : mieux vaut ne rien supprimer que supprimer au hasard.
 */
export function storagePathFromUrl(
  url: string | null | undefined,
  bucket: string,
): string | null {
  if (!url) return null;
  const marqueur = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marqueur);
  if (i < 0) return null;
  const chemin = url.slice(i + marqueur.length).split("?")[0];
  if (!chemin) return null;
  // Les chemins voyagent encodés dans une URL ; `remove()` les attend bruts.
  try {
    return decodeURIComponent(chemin);
  } catch {
    return chemin;
  }
}

/**
 * Retourne l'URL propre (sans param ?t=) pour stockage en DB.
 * Le param ?t= ne doit être utilisé qu'en mémoire pour invalider
 * le cache navigateur immédiatement après un upload.
 */
export function cleanStorageUrl(url: string): string {
  return url.split("?")[0];
}
