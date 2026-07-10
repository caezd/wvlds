export const UNIFIED_EMOJI_RE = /^[0-9a-fA-F]+(-[0-9a-fA-F]+)*$/;

/** "1f44d-1f3fb" -> "👍🏻" */
export function unifiedToNative(unified: string): string {
  try {
    return unified
      .split("-")
      .map((u) => String.fromCodePoint(parseInt(u, 16)))
      .join("");
  } catch {
    return unified;
  }
}
