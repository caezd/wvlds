import imageCompression from "browser-image-compression";

const SKIP_TYPES = new Set(["image/gif", "image/svg+xml", "image/webp"]);

/**
 * Les types que les espaces de stockage acceptent — la même liste que leurs
 * `allowed_mime_types` en base.
 *
 * Le SVG en est absent, et volontairement : ces espaces sont en lecture
 * publique, et un SVG est un document exécutable — il peut porter un script,
 * qui s'exécuterait sur le domaine qui le sert. Le refuser ICI plutôt que de
 * laisser le stockage le faire change tout pour qui téléverse : un message
 * qui nomme les formats, au lieu d'un « Téléversement impossible ».
 *
 * `image/*` sur un champ de fichier ne suffit pas : l'attribut ne filtre que
 * la fenêtre de choix, jamais un glisser-déposer.
 */
export const STORED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

/** Pour l'attribut `accept` d'un champ de fichier. */
export const STORED_IMAGE_ACCEPT = STORED_IMAGE_TYPES.join(",");

export function isStorableImage(file: File): boolean {
  return (STORED_IMAGE_TYPES as readonly string[]).includes(file.type);
}

/**
 * Converts an image file to WebP using a Web Worker (non-blocking).
 * GIF, SVG, and already-WebP files are returned unchanged.
 */
export async function toWebP(file: File, maxWidthOrHeight = 2048): Promise<File> {
  if (SKIP_TYPES.has(file.type)) return file;

  const compressed = await imageCompression(file, {
    fileType: "image/webp",
    maxWidthOrHeight,
    useWebWorker: true,
    initialQuality: 0.88,
  });

  const webpName = file.name.replace(/\.[^.]+$/, ".webp");
  return new File([compressed], webpName, { type: "image/webp" });
}

/**
 * Converts a Blob (e.g. from canvas.toBlob) to WebP.
 */
export async function blobToWebP(blob: Blob, name = "image", maxWidthOrHeight = 2048): Promise<File> {
  const file = new File([blob], `${name}.png`, { type: blob.type || "image/png" });
  return toWebP(file, maxWidthOrHeight);
}

/** Zone de découpe, en pixels de l'image d'origine — la forme que rend `react-easy-crop`. */
/**
 * Première image d'un presse-papiers ou d'un dépôt, s'il y en a une.
 *
 * Deux chemins parce que les navigateurs ne s'accordent pas : une capture
 * d'écran collée arrive dans `items` sans jamais passer par `files`, tandis
 * qu'un fichier déposé depuis l'explorateur peuple les deux. On regarde donc
 * `items` d'abord, `files` ensuite.
 */
export function firstImage(source: DataTransfer | null): File | null {
  if (!source) return null;

  const fromItems = Array.from(source.items ?? []).find(
    (i) => i.kind === "file" && i.type.startsWith("image/"),
  );
  const file = fromItems?.getAsFile() ?? null;
  if (file) return file;

  return Array.from(source.files ?? []).find((f) => f.type.startsWith("image/")) ?? null;
}

export type ZoneDeDecoupe = { x: number; y: number; width: number; height: number };

/**
 * Découpe une image à la zone donnée, et rend le résultat en WebP.
 *
 * La zone est exprimée dans les pixels de l'image SOURCE, pas dans ceux de
 * l'aperçu : c'est ce que rend `react-easy-crop`, et c'est ce qui permet de
 * recadrer sans perdre la définition d'origine.
 */
export async function cropToWebP(
  src: string,
  zone: ZoneDeDecoupe,
  name = "image",
  maxWidthOrHeight = 2048,
): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image illisible"));
    // Une image d'un autre domaine salirait le canevas et rendrait `toBlob`
    // inutilisable ; la source est ici un `data:` local, mais l'attribut ne
    // coûte rien et couvre le jour où elle viendrait d'ailleurs.
    el.crossOrigin = "anonymous";
    el.src = src;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(zone.width));
  canvas.height = Math.max(1, Math.round(zone.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canevas indisponible");
  ctx.drawImage(
    image,
    zone.x, zone.y, zone.width, zone.height,
    0, 0, canvas.width, canvas.height,
  );

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("découpe impossible");
  return blobToWebP(blob, name, maxWidthOrHeight);
}
