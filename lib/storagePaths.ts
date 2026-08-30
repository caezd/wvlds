/**
 * Noms de fichiers pour le stockage.
 *
 * ── Pourquoi ce module ───────────────────────────────────────
 * Les sept espaces de stockage sont en lecture publique : un fichier est
 * accessible à qui connaît son URL. C'est le modèle habituel de l'hébergement
 * d'images, et il ne tient qu'à une condition — que l'URL ne soit pas
 * devinable. Le nom de fichier est donc un secret, au même titre qu'un jeton.
 *
 * Six chemins de téléversement le tiraient de `Math.random().toString(36)`,
 * qui ne convient pas pour deux raisons :
 *
 *   1. `Math.random()` n'est pas cryptographique. V8 l'implémente par un
 *      xorshift128+, dont l'état se reconstitue à partir de quelques sorties
 *      consécutives.
 *   2. `.slice(2)` a une longueur VARIABLE. `(0.5).toString(36)` vaut "0.i" et
 *      ne laisse qu'un caractère. Le cas est rare mais la queue de
 *      distribution est réelle : un fichier de production porte déjà un
 *      segment de 10 caractères là où les autres en ont 11.
 *
 * `crypto.randomUUID()` corrige les deux — 122 bits d'un générateur
 * cryptographique, longueur fixe. Le dépôt s'en servait déjà pour les
 * bannières de salon ; ce module généralise ce choix.
 *
 * ── L'extension vient du TYPE, pas du nom fourni ─────────────
 * Reprendre `file.name.split(".").pop()` a deux défauts : le nom d'origine est
 * une donnée personnelle qui n'a rien à faire dans une URL publique
 * (« photo-de-mariage-julie.jpg »), et il ne décrit pas forcément le contenu —
 * après conversion par `toWebP`, une image téléversée en `.png` contient du
 * WebP. On dérive donc l'extension du type MIME réellement stocké.
 */

/** Types acceptés par les espaces de stockage, et leur extension. */
const EXTENSION_PAR_TYPE: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/**
 * Extension correspondant à un type MIME.
 *
 * @param type   type MIME du contenu réellement stocké
 * @param defaut extension à utiliser pour un type inconnu
 */
export function extensionDepuisLeType(type: string | undefined, defaut = "bin"): string {
  if (!type) return defaut;
  // Un type MIME peut porter des paramètres : « image/jpeg; charset=binary ».
  const base = type.split(";")[0].trim().toLowerCase();
  return EXTENSION_PAR_TYPE[base] ?? defaut;
}

/**
 * Nom de fichier unique et non devinable.
 *
 * Ne conserve rien du fichier d'origine : ni son nom, ni sa date. Un horodatage
 * en préfixe n'apporterait qu'un classement chronologique, au prix d'un
 * rétrécissement de l'espace à explorer pour qui chercherait à deviner.
 *
 * @param extension extension SANS le point ; assainie, car elle finit dans un chemin
 */
export function nomDeFichierUnique(extension: string): string {
  const propre = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `${crypto.randomUUID()}.${propre}`;
}

/** Nom de fichier unique dont l'extension est déduite du type MIME du contenu. */
export function nomDeFichierPourType(type: string | undefined, defaut = "webp"): string {
  return nomDeFichierUnique(extensionDepuisLeType(type, defaut));
}
