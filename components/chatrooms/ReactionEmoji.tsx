"use client";

import { useState } from "react";

const TWITTER_CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-twitter/img/twitter/64/";

const UNIFIED_RE = /^[0-9a-fA-F]+(-[0-9a-fA-F]+)*$/;

/** "1f44d-1f3fb" -> "👍🏻" (pour le fallback texte et l'alt). */
function unifiedToNative(unified: string): string {
  try {
    return unified
      .split("-")
      .map((u) => String.fromCodePoint(parseInt(u, 16)))
      .join("");
  } catch {
    return unified;
  }
}

/** "👍" -> "1f44d" (pour les anciennes réactions stockées en caractère natif). */
function nativeToUnified(native: string): string {
  return Array.from(native)
    .map((c) => c.codePointAt(0)!.toString(16).padStart(4, "0"))
    .join("-");
}

/**
 * Affiche une réaction avec le rendu Twitter (image du jeu emoji-datasource-twitter),
 * pour rester cohérent avec le picker. `value` est soit un code `unified`
 * (nouvelles réactions), soit un caractère natif (anciennes réactions) ; on
 * retombe sur le glyphe natif si l'image Twitter n'existe pas.
 */
export function ReactionEmoji({
  value,
  size = 18,
}: {
  value: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  const isUnified = UNIFIED_RE.test(value);
  const unified = (isUnified ? value : nativeToUnified(value)).toLowerCase();
  const native = isUnified ? unifiedToNative(value) : value;

  if (failed) {
    return <span className="leading-none">{native}</span>;
  }

  return (
    <img
      src={`${TWITTER_CDN}${unified}.png`}
      alt={native}
      width={size}
      height={size}
      loading="lazy"
      className="inline-block align-[-0.15em]"
      onError={() => setFailed(true)}
    />
  );
}
