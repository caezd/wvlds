// Logique pure de mise en forme du texte du composer (entourer une sélection
// de marqueurs markdown, préfixer des lignes en liste), extraite pour être
// testable indépendamment du DOM/contentEditable.

export type WrapResult = {
  text: string;
  /** Nouvelle sélection à appliquer dans l'éditeur après la transformation. */
  cursorStart: number;
  cursorEnd: number;
};

/**
 * Entoure `text[selStart:selEnd]` de `before`/`after`.
 * - Avec une sélection non vide : le texte sélectionné est enveloppé, le
 *   curseur est replacé juste après (collapsed).
 * - Sans sélection (selStart === selEnd) : insère la paire de marqueurs vide
 *   et place le curseur entre les deux, prêt à taper.
 */
export function wrapSelection(
  text: string,
  selStart: number,
  selEnd: number,
  before: string,
  after: string,
): WrapResult {
  const selected = text.slice(selStart, selEnd);
  const wrapped = before + selected + after;
  const newText = text.slice(0, selStart) + wrapped + text.slice(selEnd);

  if (selStart === selEnd) {
    const cursor = selStart + before.length;
    return { text: newText, cursorStart: cursor, cursorEnd: cursor };
  }

  const cursor = selStart + wrapped.length;
  return { text: newText, cursorStart: cursor, cursorEnd: cursor };
}

/**
 * Préfixe chaque ligne non vide couvrant `[selStart, selEnd]` par `"- "`.
 * Étend la sélection aux lignes entières touchées, puis sélectionne le bloc
 * résultant en entier (retour visuel de ce qui a changé).
 */
export function applyListPrefix(text: string, selStart: number, selEnd: number): WrapResult {
  const lineStart = text.lastIndexOf("\n", Math.max(selStart - 1, 0)) + 1;
  const searchFrom = Math.max(selEnd, lineStart);
  const nlIdx = text.indexOf("\n", searchFrom);
  const lineEnd = nlIdx === -1 ? text.length : nlIdx;

  const block = text.slice(lineStart, lineEnd);
  const newBlock = block
    .split("\n")
    .map((line) => (line.length ? `- ${line}` : line))
    .join("\n");

  const newText = text.slice(0, lineStart) + newBlock + text.slice(lineEnd);
  return { text: newText, cursorStart: lineStart, cursorEnd: lineStart + newBlock.length };
}

const HEADING_PREFIX_RE = /^(#{1,6})\s+/;

function applyHeadingToLine(line: string, level: number): string {
  if (!line.length) return line;
  const match = line.match(HEADING_PREFIX_RE);
  const bareLine = match ? line.slice(match[0].length) : line;
  const currentLevel = match ? match[1].length : 0;
  // Même niveau déjà appliqué → bascule (retire le marqueur au lieu de le dupliquer).
  return currentLevel === level ? bareLine : `${"#".repeat(level)} ${bareLine}`;
}

/**
 * Préfixe chaque ligne non vide couvrant `[selStart, selEnd]` par `"#" * level + " "`
 * (titre markdown ATX). Remplace un marqueur de titre existant plutôt que de
 * l'empiler ; reclique le même niveau pour revenir à un paragraphe normal.
 */
export function applyHeadingPrefix(
  text: string,
  selStart: number,
  selEnd: number,
  level: number,
): WrapResult {
  const lineStart = text.lastIndexOf("\n", Math.max(selStart - 1, 0)) + 1;
  const searchFrom = Math.max(selEnd, lineStart);
  const nlIdx = text.indexOf("\n", searchFrom);
  const lineEnd = nlIdx === -1 ? text.length : nlIdx;

  const block = text.slice(lineStart, lineEnd);
  const newBlock = block
    .split("\n")
    .map((line) => applyHeadingToLine(line, level))
    .join("\n");

  const newText = text.slice(0, lineStart) + newBlock + text.slice(lineEnd);
  return { text: newText, cursorStart: lineStart, cursorEnd: lineStart + newBlock.length };
}
