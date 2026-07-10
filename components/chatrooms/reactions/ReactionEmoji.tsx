"use client";

import { useState } from "react";
import Image from "next/image";
import { UNIFIED_EMOJI_RE, unifiedToNative } from "@/lib/emoji";

const TWITTER_CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-twitter/img/twitter/64/";

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

  const isUnified = UNIFIED_EMOJI_RE.test(value);
  const unified = (isUnified ? value : nativeToUnified(value)).toLowerCase();
  const native = isUnified ? unifiedToNative(value) : value;

  if (failed) {
    return <span className="leading-none">{native}</span>;
  }

  return (
    <Image
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
