import { createFenceTracker } from "@/lib/textStyledSpans";

// Un extrait de code inline (`...`, ``...``, …) — un `[[Titre]]` tapé pour
// documenter la syntaxe dans un bloc de code ne doit jamais être résolu.
const INLINE_CODE_RE = /(`+)[^\n]*?\1/g;
const WIKI_LINK_RE = /\[\[([^\]\n]+)\]\]/g;

export type WikiLinkTarget = { title: string; slug: string };

function transformSegment(segment: string, bySlug: Map<string, string>): string {
  return segment.replace(WIKI_LINK_RE, (match, rawTitle: string) => {
    const title = rawTitle.trim();
    if (!title) return match;
    const slug = bySlug.get(title.toLowerCase());
    // Slug vide = page introuvable — rendu visuellement cassé par
    // MarkdownRenderer plutôt qu'un lien mort silencieux (voir composant `a`).
    return `[${title}](wiki:${slug ?? ""})`;
  });
}

function transformLine(line: string, bySlug: Map<string, string>): string {
  const parts: string[] = [];
  let lastIndex = 0;
  INLINE_CODE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_CODE_RE.exec(line))) {
    parts.push(transformSegment(line.slice(lastIndex, match.index), bySlug));
    parts.push(match[0]); // extrait de code inline : intact
    lastIndex = INLINE_CODE_RE.lastIndex;
  }
  parts.push(transformSegment(line.slice(lastIndex), bySlug));
  return parts.join("");
}

/**
 * Résout `[[Titre de page]]` en lien markdown `[Titre](wiki:slug)` contre les
 * pages du wiki déjà chargées en mémoire (aucune requête réseau). Ignore le
 * contenu des blocs de code fencés, comme `transformStyledSpans`.
 */
export function resolveWikiLinks(markdown: string, pages: WikiLinkTarget[]): string {
  const bySlug = new Map(pages.map(p => [p.title.toLowerCase(), p.slug]));
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const fenceTracker = createFenceTracker();
  const out: string[] = [];

  for (const line of lines) {
    if (fenceTracker.consume(line)) { out.push(line); continue; }
    out.push(transformLine(line, bySlug));
  }

  return out.join("\n");
}
