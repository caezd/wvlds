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

/** Un lieu de la carte, tel qu'un `[[lieu:…]]` le vise. */
export type MapLinkTarget = {
  id: string;
  title: string;
  map_id: string;
};

/**
 * Le préfixe qui fait d'un `[[…]]` un lien vers un lieu de la carte plutôt
 * que vers une page — dans les trois langues de l'application, pour que
 * chacun l'écrive comme il parle.
 */
const MAP_LINK_PREFIX_RE = /^(lieu|place|lugar):/i;

/** « lieu:Le port » → le préfixe tel qu'écrit, et le titre ; `null` sinon. */
export function splitMapLinkPrefix(raw: string): { prefix: string; title: string } | null {
  const m = MAP_LINK_PREFIX_RE.exec(raw.trimStart());
  if (!m) return null;
  return { prefix: m[0], title: raw.trimStart().slice(m[0].length) };
}

/** Ce que chaque titre désigne — voir `uniqueByTitle`. */
type Resolved = Map<string, string>;

function transformSegment(segment: string, bySlug: Resolved, pinById: Resolved): string {
  return segment.replace(WIKI_LINK_RE, (match, rawTitle: string) => {
    // `[[lieu:Le port]]` vise un lieu de la carte, pas une page. Le libellé
    // rendu est le titre seul : le préfixe est une syntaxe, pas un mot.
    const lieu = splitMapLinkPrefix(rawTitle);
    if (lieu) {
      const title = lieu.title.trim();
      if (!title) return match;
      return `[${title}](map:${pinById.get(title.toLowerCase()) ?? ""})`;
    }

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

function transformLine(line: string, bySlug: Resolved, pinById: Resolved): string {
  const parts: string[] = [];
  let lastIndex = 0;
  INLINE_CODE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_CODE_RE.exec(line))) {
    parts.push(transformSegment(line.slice(lastIndex, match.index), bySlug, pinById));
    parts.push(match[0]); // extrait de code inline : intact
    lastIndex = INLINE_CODE_RE.lastIndex;
  }
  parts.push(transformSegment(line.slice(lastIndex), bySlug, pinById));
  return parts.join("");
}

/**
 * Ce que chaque titre désigne sans ambiguïté, en clé minuscule.
 *
 * Seul (world_id, slug) est garanti unique — deux pages peuvent partager le
 * même titre (le dédoublonnage à la création ne renomme que le slug, pas
 * le titre), et deux lieux sur deux cartes aussi. Un titre ambigu doit
 * rester "non résolu" (lien cassé) plutôt que de pointer arbitrairement vers
 * l'un des deux homonymes.
 *
 * Le titre écrit À LA LETTRE l'emporte. « Test » et « test » sont deux
 * pages différentes : qui écrit `[[Test]]` désigne la première, et
 * l'autocomplétion écrit justement le titre exact. Ce n'est qu'à défaut
 * d'une correspondance exacte unique qu'on compare sans la casse.
 */
function uniqueByTitle<T extends { title: string }>(items: T[], value: (item: T) => string): Resolved {
  const exact = new Map<string, number>();
  const loose = new Map<string, number>();
  for (const item of items) {
    exact.set(item.title, (exact.get(item.title) ?? 0) + 1);
    const key = item.title.toLowerCase();
    loose.set(key, (loose.get(key) ?? 0) + 1);
  }

  const resolved: Resolved = new Map();
  for (const item of items) {
    const key = item.title.toLowerCase();
    if (loose.get(key) === 1) resolved.set(key, value(item));
  }
  // L'exact passe en second pour avoir le dernier mot sur la même clé.
  for (const item of items) {
    if (exact.get(item.title) === 1) resolved.set(item.title.toLowerCase(), value(item));
  }
  return resolved;
}

/**
 * Résout `[[Titre de page]]` en lien markdown `[Titre](wiki:slug)` contre les
 * pages du wiki déjà chargées en mémoire (aucune requête réseau), et
 * `[[lieu:Titre]]` en `[Titre](map:id)` contre les lieux de la carte. Ignore
 * le contenu des blocs de code fencés, comme `transformStyledSpans`.
 */
export function resolveWikiLinks(
  markdown: string,
  pages: WikiLinkTarget[],
  pins: MapLinkTarget[] = [],
): string {
  // Les dossiers ne comptent pas. Un lien ne peut pas en ouvrir un, et un
  // dossier « Test » à côté d'une page « Test » ne rend pas la page
  // introuvable pour autant.
  const bySlug = uniqueByTitle(pages.filter(p => !p.is_folder), p => p.slug);
  const pinById = uniqueByTitle(pins, p => p.id);

  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const fenceTracker = createFenceTracker();
  const out: string[] = [];

  for (const line of lines) {
    if (fenceTracker.consume(line)) { out.push(line); continue; }
    out.push(transformLine(line, bySlug, pinById));
  }

  return out.join("\n");
}
