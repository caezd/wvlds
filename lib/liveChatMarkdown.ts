/**
 * Mise en forme des messages de la chatbox : `**gras**` et `*italique*`,
 * rien d'autre (ni liens, ni titres, ni listes). Un astérisque sans partenaire,
 * ou collé à une espace du côté intérieur (« 2 * 3 »), reste tel quel.
 */

export type LiveChatSpan =
  | { type: "text"; text: string }
  | { type: "strong" | "em"; children: LiveChatSpan[] };

// Contenu qui commence et finit par autre chose qu'une espace ; le gras peut
// contenir de l'italique, l'italique ne contient aucun astérisque.
const BOLD = /\*\*([^\s*](?:[\s\S]*?[^\s*])?)\*\*/;
const ITALIC = /\*([^\s*](?:[^*]*?[^\s*])?)\*/;

export function parseLiveChatMarkdown(text: string): LiveChatSpan[] {
  const spans: LiveChatSpan[] = [];
  let rest = text;
  while (rest) {
    const bold = BOLD.exec(rest);
    const italic = ITALIC.exec(rest);
    // Le premier qui commence l'emporte ; à égalité, le gras (`**` avant `*`).
    const match = bold && (!italic || bold.index <= italic.index) ? bold : italic;
    if (!match) {
      spans.push({ type: "text", text: rest });
      break;
    }
    if (match.index > 0) spans.push({ type: "text", text: rest.slice(0, match.index) });
    spans.push({
      type: match === bold ? "strong" : "em",
      children: match === bold ? parseLiveChatMarkdown(match[1]) : [{ type: "text", text: match[1] }],
    });
    rest = rest.slice(match.index + match[0].length);
  }
  return spans;
}

/** Le texte sans ses marques, pour les aperçus (barre, citation d'une réponse). */
export function liveChatPlainText(text: string): string {
  const flat = (spans: LiveChatSpan[]): string =>
    spans.map((s) => (s.type === "text" ? s.text : flat(s.children))).join("");
  return flat(parseLiveChatMarkdown(text));
}
