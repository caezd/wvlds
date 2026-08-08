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
  // Seul (world_id, slug) est garanti unique — deux pages peuvent partager le
  // même titre (le dédoublonnage à la création ne renomme que le slug, pas
  // le titre). Un titre ambigu doit rester "non résolu" (lien cassé) plutôt
  // que de pointer arbitrairement vers l'une des deux pages homonymes.
  const counts = new Map<string, number>();
  for (const p of pages) {
    const key = p.title.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const bySlug = new Map<string, string>();
  for (const p of pages) {
    const key = p.title.toLowerCase();
    if (counts.get(key) === 1) bySlug.set(key, p.slug);
  }
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const fenceTracker = createFenceTracker();
  const out: string[] = [];

  for (const line of lines) {
    if (fenceTracker.consume(line)) { out.push(line); continue; }
    out.push(transformLine(line, bySlug));
  }

  return out.join("\n");
}
