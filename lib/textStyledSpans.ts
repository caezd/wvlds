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

function isFenceLine(line: string): { char: string; len: number } | null {
  const m = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  if (!m) return null;
  return { char: m[2][0], len: m[2].length };
}

function transformSegment(segment: string): string {
  return segment.replace(
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

/**
 * Applique la transformation ligne par ligne, en ignorant le contenu des
 * blocs de code délimités (```/~~~) — un span stylé ne doit jamais être
 * interprété à l'intérieur d'un extrait de code partagé dans le message.
 * Ne traverse pas les sauts de ligne : un span doit s'ouvrir et se fermer
 * sur la même ligne (limite acceptée, cohérente avec un usage de mise en
 * forme courte plutôt que de longs paragraphes stylés).
 */
export function transformStyledSpans(input: string): string {
  const lines = (input ?? "").replace(/\r\n/g, "\n").split("\n");

  let inFence = false;
  let fenceChar: string | null = null;
  let fenceLen = 0;
  const out: string[] = [];

  for (const line of lines) {
    const fence = isFenceLine(line);

    if (!inFence && fence) {
      inFence = true;
      fenceChar = fence.char;
      fenceLen = fence.len;
      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(line);
      if (fence && fence.char === fenceChar && fence.len >= fenceLen) {
        inFence = false;
        fenceChar = null;
        fenceLen = 0;
      }
      continue;
    }

    out.push(transformLine(line));
  }

  return out.join("\n");
}
