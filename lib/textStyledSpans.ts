// Langage codé façon markdown pour styler du texte inline :
//
//   $#RRGGBB$texte coloré$$   → couleur de texte
//   ++texte souligné++       → souligné (pas de syntaxe native en markdown/GFM)
//
// Transformé en syntaxe de lien markdown standard (`[texte](color:RRGGBB)` /
// `[texte](underline:)`) plutôt qu'en HTML brut : le renderer (skipHtml actif
// par sécurité) ne touche jamais au HTML utilisateur, et le markdown imbriqué
// à l'intérieur (ex. `$#ff0000$**gras**$$`) continue de fonctionner puisque
// c'est le texte du lien qui est reparsé normalement par remark.

const COLOR_SPAN_RE = /\$#([0-9a-fA-F]{3,8})\$([^\n]*?)\$\$/g;
const UNDERLINE_SPAN_RE = /\+\+([^\n]*?)\+\+/g;

function isFenceLine(line: string): { char: string; len: number } | null {
  const m = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  if (!m) return null;
  return { char: m[2][0], len: m[2].length };
}

function transformLine(line: string): string {
  const withColor = line.replace(COLOR_SPAN_RE, (match, hex: string, inner: string) => {
    if (!inner) return match; // évite un lien vide
    return `[${inner}](color:${hex})`;
  });
  return withColor.replace(UNDERLINE_SPAN_RE, (match, inner: string) => {
    if (!inner) return match;
    return `[${inner}](underline:)`;
  });
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
