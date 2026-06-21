const OPENING_QUOTES = ['"', '«', '“'] as const; // " « "
const CLOSING_QUOTE_MAP: Record<string, string> = {
  '"': '"',
  '«': '»',
  '“': '”', // " → "
};

export type DialoguePart =
  | { kind: "dialogue"; speech: string }
  | { kind: "prose"; text: string };

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
        result.push({ kind: "dialogue", speech });

        // Ce qui suit le guillemet fermant devient un paragraphe prose séparé
        const after = t.slice(closeIdx + 1).trim();
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
