import { createFenceTracker } from "@/lib/textStyledSpans";

// Un extrait de code inline (`...`, ``...``, …) — un terme tapé pour
// documenter la syntaxe dans un bloc de code ne doit jamais être surligné.
const INLINE_CODE_RE = /(`+)[^\n]*?\1/g;
// Un lien markdown déjà résolu (ex: `[[Titre]]` → `[Titre](wiki:slug)` par
// resolveWikiLinks, ou un lien classique tapé à la main) — protégé en bloc,
// texte et cible compris, pour ne jamais réinjecter un second lien imbriqué
// (CommonMark ne les supporte pas) ni corrompre l'URL cible.
const MARKDOWN_LINK_RE = /\[[^\]\n]*\]\([^)\n]*\)/g;

export type LexiconTerm = { id: string; term: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTermPattern(terms: LexiconTerm[]): RegExp | null {
  const withTerm = terms.filter((t) => t.term.trim().length > 0);
  if (withTerm.length === 0) return null;
  // Termes les plus longs d'abord : évite qu'un terme court ("Ordre") ne
  // "mange" la moitié d'un terme plus long qui le contient ("Ordre Noir").
  const sorted = [...withTerm].sort((a, b) => b.term.length - a.term.length);
  const alternation = sorted.map((t) => escapeRegExp(t.term)).join("|");
  // Frontières \p{L}/\p{N} plutôt que \b : \b ne connaît que [A-Za-z0-9_],
  // ce qui casse la frontière avant/après une lettre accentuée (termes FR).
  return new RegExp(`(?<![\\p{L}\\p{N}_])(${alternation})(?![\\p{L}\\p{N}_])`, "giu");
}

function transformSegment(segment: string, pattern: RegExp, byLowerTerm: Map<string, string>): string {
  return segment.replace(pattern, (match) => {
    const id = byLowerTerm.get(match.toLowerCase());
    if (!id) return match; // ne devrait pas arriver (pattern construit depuis les mêmes termes)
    return `[${match}](lexicon:${id})`;
  });
}

function transformLine(line: string, pattern: RegExp, byLowerTerm: Map<string, string>): string {
  // Protège d'abord les liens markdown déjà présents (englobent les extraits
  // de code inline qu'ils pourraient contenir), puis le code inline restant.
  const parts: string[] = [];
  let lastIndex = 0;
  MARKDOWN_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK_RE.exec(line))) {
    parts.push(transformInlineCodeAware(line.slice(lastIndex, match.index), pattern, byLowerTerm));
    parts.push(match[0]); // lien existant : intact
    lastIndex = MARKDOWN_LINK_RE.lastIndex;
  }
  parts.push(transformInlineCodeAware(line.slice(lastIndex), pattern, byLowerTerm));
  return parts.join("");
}

function transformInlineCodeAware(segment: string, pattern: RegExp, byLowerTerm: Map<string, string>): string {
  const parts: string[] = [];
  let lastIndex = 0;
  INLINE_CODE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_CODE_RE.exec(segment))) {
    parts.push(transformSegment(segment.slice(lastIndex, match.index), pattern, byLowerTerm));
    parts.push(match[0]); // extrait de code inline : intact
    lastIndex = INLINE_CODE_RE.lastIndex;
  }
  parts.push(transformSegment(segment.slice(lastIndex), pattern, byLowerTerm));
  return parts.join("");
}

/**
 * Surligne chaque occurrence des termes du lexique du monde en lien markdown
 * `[texte](lexicon:id)` — intercepté par le composant `a` de MarkdownRenderer
 * pour afficher un popover (terme + description) au clic. Insensible à la
 * casse (le texte affiché garde la casse d'origine) ; ignore les blocs de
 * code fencés, le code inline, et les liens markdown déjà présents.
 */
export function highlightLexiconTerms(markdown: string, terms: LexiconTerm[]): string {
  const pattern = buildTermPattern(terms);
  if (!pattern) return markdown;

  const byLowerTerm = new Map<string, string>();
  for (const t of terms) {
    const key = t.term.trim().toLowerCase();
    if (key) byLowerTerm.set(key, t.id);
  }

  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const fenceTracker = createFenceTracker();
  const out: string[] = [];

  for (const line of lines) {
    if (fenceTracker.consume(line)) { out.push(line); continue; }
    out.push(transformLine(line, pattern, byLowerTerm));
  }

  return out.join("\n");
}
