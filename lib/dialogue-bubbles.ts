const OPENING_QUOTES = ['"', '«', '"'] as const; // " « "
const CLOSING_QUOTE_MAP: Record<string, string> = {
  '"': '"',
  '«': '»',
};

export type DialoguePart =
  | { kind: "dialogue"; speech: string; incise: string | null }
  | { kind: "prose"; text: string };

function parseParagraph(para: string): DialoguePart[] {
  const t = para.trim();
  if (!t) return [];

  const parts: DialoguePart[] = [];
  let i = 0;

  while (i < t.length) {
    const openChar = t[i];

    if (!(OPENING_QUOTES as readonly string[]).includes(openChar)) {
      // Accumule du texte prose jusqu'au prochain guillemet ouvrant
      let end = i + 1;
      while (end < t.length && !(OPENING_QUOTES as readonly string[]).includes(t[end])) end++;
      const prose = t.slice(i, end).trim();
      if (prose) parts.push({ kind: "prose", text: prose });
      i = end;
      continue;
    }

    const closeChar = CLOSING_QUOTE_MAP[openChar];
    const closeIdx = t.indexOf(closeChar, i + 1);

    if (closeIdx === -1) {
      // Guillemet non fermé → prose
      parts.push({ kind: "prose", text: t.slice(i).trim() });
      break;
    }

    const speech = t.slice(i + 1, closeIdx).trim();
    let after = t.slice(closeIdx + 1);

    // Cherche si une incise précède le prochain dialogue (ou la fin)
    let incise: string | null = null;
    const nextOpenIdx = after.search(new RegExp(`[${OPENING_QUOTES.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("")}]`));
    if (nextOpenIdx === -1) {
      // Rien après : l'after complet est l'incise (ou vide)
      incise = after.trim() || null;
      i = t.length;
    } else {
      incise = after.slice(0, nextOpenIdx).trim() || null;
      i = closeIdx + 1 + nextOpenIdx;
    }

    parts.push({ kind: "dialogue", speech, incise });
  }

  return parts;
}

export function parseDialogue(content: string): DialoguePart[] {
  return content.split(/\n{2,}/).flatMap(parseParagraph);
}
