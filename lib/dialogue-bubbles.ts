const OPENING_QUOTES = ['"', '«', '“'] as const; // " « "
const CLOSING_QUOTE_MAP: Record<string, string> = {
  '"': '"',
  '«': '»',
  '“': '”', // " → "
};

export type DialoguePart =
  | { kind: "dialogue"; speech: string; color?: string }
  | { kind: "prose"; text: string };

// Marqueur de surcharge de couleur placé juste après le guillemet fermant,
// ex: "Bonjour !"{#ff0000}
const COLOR_OVERRIDE_RE = /^\s*\{#([0-9a-fA-F]{3,8})\}/;

export function parseDialogue(content: string): DialoguePart[] {
  const result: DialoguePart[] = [];

  for (const para of content.split(/\n{2,}/)) {
    const t = para.trim();
    if (!t) continue;

    const firstChar = t[0];

    if ((OPENING_QUOTES as readonly string[]).includes(firstChar)) {
      const closeChar = CLOSING_QUOTE_MAP[firstChar];
      const closeIdx = t.indexOf(closeChar, 1);

      if (closeIdx !== -1) {
        const speech = t.slice(1, closeIdx).trim();
        const afterRaw = t.slice(closeIdx + 1);
        const colorMatch = afterRaw.match(COLOR_OVERRIDE_RE);
        const color = colorMatch ? `#${colorMatch[1]}` : undefined;
        result.push({ kind: "dialogue", speech, color });

        // Ce qui suit le guillemet fermant (et la surcharge éventuelle)
        // devient un paragraphe prose séparé
        const after = (colorMatch ? afterRaw.slice(colorMatch[0].length) : afterRaw).trim();
        if (after) result.push({ kind: "prose", text: after });
      } else {
        // Guillemet non fermé → prose brute
        result.push({ kind: "prose", text: t });
      }
    } else {
      result.push({ kind: "prose", text: t });
    }
  }

  return result;
}
