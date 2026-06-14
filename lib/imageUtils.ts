import imageCompression from "browser-image-compression";

const SKIP_TYPES = new Set(["image/gif", "image/svg+xml", "image/webp"]);

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
