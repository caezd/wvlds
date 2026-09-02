import { createFenceTracker } from "@/lib/textStyledSpans";
import { slugify } from "@/lib/slug";

// Un extrait de code inline (`...`, ``...``, …) — un `[[Titre]]` tapé pour
// documenter la syntaxe dans un bloc de code ne doit jamais être résolu.
const INLINE_CODE_RE = /(`+)[^\n]*?\1/g;
const WIKI_LINK_RE = /\[\[([^\]\n]+)\]\]/g;

export type WikiLinkTarget = {
  title: string;
  slug: string;
  /** Un dossier ne s'ouvre pas : il n'est jamais la cible d'un lien. */
  is_folder?: boolean;
};

function transformSegment(segment: string, bySlug: Map<string, string>): string {
  return segment.replace(WIKI_LINK_RE, (match, rawTitle: string) => {
    // `[[Titre#Section]]` vise une section de la page. Les titres portent déjà
    // un `id` (voir `extractHeadings`, même algorithme que MarkdownRenderer) :
    // il ne manquait qu'une syntaxe pour s'en servir.
    const diese = rawTitle.indexOf("#");
    const title = (diese === -1 ? rawTitle : rawTitle.slice(0, diese)).trim();
    const section = diese === -1 ? "" : rawTitle.slice(diese + 1).trim();

    // `[[#Section]]` sans titre reste dans la page courante.
    if (!title) {
      return section ? `[${section}](wiki:#${slugify(section)})` : match;
    }

    const slug = bySlug.get(title.toLowerCase());
    // Slug vide = page introuvable — rendu visuellement cassé par
    // MarkdownRenderer plutôt qu'un lien mort silencieux (voir composant `a`).
    const ancre = section ? `#${slugify(section)}` : "";
    return `[${rawTitle.trim()}](wiki:${slug ?? ""}${slug ? ancre : ""})`;
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
  //
  // Deux égards avant de déclarer l'ambiguïté :
  // - les dossiers ne comptent pas. Un lien ne peut pas en ouvrir un, et un
  //   dossier « Test » à côté d'une page « Test » ne rend pas la page
  //   introuvable pour autant.
  // - le titre écrit À LA LETTRE l'emporte. « Test » et « test » sont deux
  //   pages différentes : qui écrit `[[Test]]` désigne la première, et
  //   l'autocomplétion écrit justement le titre exact. Ce n'est qu'à défaut
  //   d'une correspondance exacte unique qu'on compare sans la casse.
  const candidates = pages.filter(p => !p.is_folder);

  const exact = new Map<string, number>();
  const loose = new Map<string, number>();
  for (const p of candidates) {
    exact.set(p.title, (exact.get(p.title) ?? 0) + 1);
    const key = p.title.toLowerCase();
    loose.set(key, (loose.get(key) ?? 0) + 1);
  }

  const bySlug = new Map<string, string>();
  for (const p of candidates) {
    const key = p.title.toLowerCase();
    if (loose.get(key) === 1) bySlug.set(key, p.slug);
  }
  // L'exact passe en second pour avoir le dernier mot sur la même clé.
  for (const p of candidates) {
    if (exact.get(p.title) === 1) bySlug.set(p.title.toLowerCase(), p.slug);
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
