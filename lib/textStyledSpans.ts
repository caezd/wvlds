// Langage codé façon markdown pour styler du texte inline :
//
//   [#RRGGBB]texte coloré[/]   → couleur de texte
//   ++texte souligné++        → souligné (pas de syntaxe native en markdown/GFM)
//
// Transformé en syntaxe de lien markdown standard (`[texte](color:RRGGBB)` /
// `[texte](underline:)`) plutôt qu'en HTML brut : le renderer (skipHtml actif
// par sécurité) ne touche jamais au HTML utilisateur, et le markdown imbriqué
// à l'intérieur (ex. `[#ff0000]**gras**[/]`) continue de fonctionner puisque
// c'est le texte du lien qui est reparsé normalement par remark. La
// transformation tourne avant que remark ne voie le texte brut, donc
// `[#hex]…[/]` n'est jamais interprété comme un vrai lien markdown.
//
// Un seul marqueur "gagne" par passage de texte : imbriquer couleur et
// souligné l'un dans l'autre (ex. `[#f00]++x++[/]`) ne peut pas produire
// deux vrais liens markdown imbriqués (CommonMark ne supporte pas les liens
// imbriqués, donc l'un des deux resterait cassé au rendu de toute façon) —
// le marqueur le plus englobant s'applique, l'autre reste littéral plutôt
// que de produire du markdown invalide. D'où un seul passage combiné (pas
// deux `.replace()` successifs) : le second ne doit jamais retomber sur le
// texte déjà produit par le premier.
const STYLED_SPAN_RE =
  /\[#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\]([^\n]*?)\[\/\]|\+\+([^\n]*?)\+\+/g;

// Un extrait de code inline (`...`, ``...``, …) : CommonMark exige la même
// longueur de run de backticks en ouverture/fermeture. Les marqueurs à
// l'intérieur ne doivent jamais être transformés — un `` `[#hex]texte[/]` ``
// dans un message (ex. pour documenter la syntaxe) doit rester littéral.
const INLINE_CODE_RE = /(`+)[^\n]*?\1/g;

export function isFenceLine(line: string): { char: string; len: number } | null {
  const m = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  if (!m) return null;
  return { char: m[2][0], len: m[2].length };
}

/**
 * Machine d'état pour suivre l'ouverture/fermeture d'un bloc de code fencé
 * (```/~~~) ligne par ligne. `consume(line)` renvoie `true` (et met à jour
 * l'état interne) si la ligne fait partie d'un fence — ouverture, contenu,
 * ou fermeture — auquel cas l'appelant doit la laisser passer telle quelle
 * sans lui appliquer de transformation de texte.
 */
export function createFenceTracker() {
  let inFence = false;
  let fenceChar: string | null = null;
  let fenceLen = 0;

  return {
    consume(line: string): boolean {
      const fence = isFenceLine(line);

      if (!inFence && fence) {
        inFence = true;
        fenceChar = fence.char;
        fenceLen = fence.len;
        return true;
      }

      if (inFence) {
        if (fence && fence.char === fenceChar && fence.len >= fenceLen) {
          inFence = false;
          fenceChar = null;
          fenceLen = 0;
        }
        return true;
      }

      return false;
    },
  };
}

// Une emphase dont le marqueur fermant suit une espace (`**gras **`) :
// Markdown ne la ferme pas. On sort l'espace du marqueur (`**gras** `).
// D'abord les marqueurs doubles, puis `*`/`_` seuls, sans toucher aux doubles.
const DOUBLE_EMPHASIS_TRAILING_SPACE_RE = /(\*\*|__|~~)(?=\S)((?:(?!\1)[^\n])*?\S)([ \t]+)\1/g;
const SINGLE_EMPHASIS_TRAILING_SPACE_RE = /(?<![*_\w])([*_])(?=[^\s*_])([^\n*_]*?[^\s*_])([ \t]+)\1(?![*_])/g;

function closeEmphasisTightly(segment: string): string {
  return segment
    .replace(DOUBLE_EMPHASIS_TRAILING_SPACE_RE, "$1$2$1$3")
    .replace(SINGLE_EMPHASIS_TRAILING_SPACE_RE, "$1$2$1$3");
}

function transformSegment(segment: string): string {
  return closeEmphasisTightly(segment).replace(
    STYLED_SPAN_RE,
    (match, hex: string | undefined, colorInner: string | undefined, underlineInner: string | undefined) => {
      if (hex !== undefined) {
        if (!colorInner) return match; // évite un lien vide
        return `[${colorInner}](color:${hex})`;
      }
      if (!underlineInner) return match;
      return `[${underlineInner}](underline:)`;
    },
  );
}

function transformLine(line: string): string {
  const parts: string[] = [];
  let lastIndex = 0;
  INLINE_CODE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_CODE_RE.exec(line))) {
    parts.push(transformSegment(line.slice(lastIndex, match.index)));
    parts.push(match[0]); // extrait de code inline : intact
    lastIndex = INLINE_CODE_RE.lastIndex;
  }
  parts.push(transformSegment(line.slice(lastIndex)));
  return parts.join("");
}

// ── Emphase sur plusieurs paragraphes ──────────────────────────────────────
//
// Markdown ne fait pas traverser une emphase d'un paragraphe à l'autre :
// `*Un\n\nDeux*` reste littéral. Une emphase ouverte dans un paragraphe et
// fermée dans un suivant est refermée en fin de chaque paragraphe qu'elle
// couvre et rouverte au début du suivant.

const SPREAD_MARKERS = ["**", "__", "~~", "*", "_"] as const;
const PARAGRAPH_SPLIT_RE = /(\n[ \t]*\n+)/;
// Ce qui précède le texte d'une ligne : puce, numéro, titre, citation.
const BLOCK_PREFIX_RE = /^[ \t]*(?:(?:[-*+]|\d+[.)])[ \t]+|#{1,6}[ \t]+|>[ \t]?)*/;

type Run = { opens: boolean; closes: boolean };

/** Les marqueurs `marker` isolés du paragraphe, hors code inline. */
function markerRuns(paragraph: string, marker: string): Run[] {
  // Le code inline ne compte pas ; masqué par un caractère neutre (ni espace ni lettre).
  const masked = paragraph.replace(INLINE_CODE_RE, (m) => "¤".repeat(m.length));
  const c = marker[0] === "*" ? "\\*" : marker[0];
  const re = new RegExp(`(?<!${c})${c}{${marker.length}}(?!${c})`, "g");
  const runs: Run[] = [];
  for (const m of masked.matchAll(re)) {
    const before = masked[m.index - 1] ?? "";
    const after = masked[m.index + marker.length] ?? "";
    // `snake_case` : un `_` entre deux lettres n'est pas un marqueur.
    if (marker[0] === "_" && /\w/.test(before) && /\w/.test(after)) continue;
    runs.push({ opens: /\S/.test(after), closes: /\S/.test(before) });
  }
  return runs;
}

/** Plusieurs puces / titres / citations : une emphase ne couvre pas le paragraphe d'un bloc. */
function isMultiBlock(paragraph: string): boolean {
  return paragraph.split("\n").slice(1).some((line) => BLOCK_PREFIX_RE.exec(line)![0].length > 0);
}

/** `marker` juste après la puce / le titre éventuel de la première ligne. */
function openAtStart(paragraph: string, marker: string): string {
  const prefix = BLOCK_PREFIX_RE.exec(paragraph)![0];
  return prefix + marker + paragraph.slice(prefix.length);
}

function closeAtEnd(paragraph: string, marker: string): string {
  return paragraph.replace(/[ \t]*$/, marker);
}

function spreadEmphasisAcrossParagraphs(input: string): string {
  const parts = input.split(PARAGRAPH_SPLIT_RE);
  // Index pairs : paragraphes ; impairs : séparateurs.
  const fences = createFenceTracker();
  const inCode = parts.map((part, i) => i % 2 === 0 && part.split("\n").map((l) => fences.consume(l)).some(Boolean));

  for (const marker of SPREAD_MARKERS) {
    for (let i = 0; i < parts.length; i += 2) {
      if (inCode[i] || isMultiBlock(parts[i])) continue;
      const first = markerRuns(parts[i], marker);
      if (first.length % 2 === 0 || !first.at(-1)!.opens) continue;
      // Le premier paragraphe suivant où le marqueur reste seul le ferme.
      let j = i + 2;
      let blocked = false;
      for (; j < parts.length; j += 2) {
        if (inCode[j] || isMultiBlock(parts[j])) { blocked = true; break; }
        if (markerRuns(parts[j], marker).length % 2 === 1) break;
      }
      if (blocked || j >= parts.length || !markerRuns(parts[j], marker)[0].closes) continue;
      parts[i] = closeAtEnd(parts[i], marker);
      for (let k = i + 2; k < j; k += 2) parts[k] = closeAtEnd(openAtStart(parts[k], marker), marker);
      parts[j] = openAtStart(parts[j], marker);
      i = j - 2;
    }
  }
  return parts.join("");
}

/**
 * Applique la transformation ligne par ligne, en ignorant le contenu des
 * blocs de code délimités (```/~~~) — un span stylé ne doit jamais être
 * interprété à l'intérieur d'un extrait de code partagé dans le message.
 * Ne traverse pas les sauts de ligne : un span doit s'ouvrir et se fermer
 * sur la même ligne (limite acceptée, cohérente avec un usage de mise en
 * forme courte plutôt que de longs paragraphes stylés).
 */
export function transformStyledSpans(input: string): string {
  const lines = spreadEmphasisAcrossParagraphs((input ?? "").replace(/\r\n/g, "\n")).split("\n");

  const fenceTracker = createFenceTracker();
  const out: string[] = [];

  for (const line of lines) {
    if (fenceTracker.consume(line)) {
      out.push(line);
      continue;
    }
    out.push(transformLine(line));
  }

  return out.join("\n");
}
