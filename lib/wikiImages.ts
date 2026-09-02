import { createFenceTracker } from "@/lib/textStyledSpans";

/**
 * Images d'un article, dans l'ordre du document.
 *
 * Sert à la visionneuse : cliquer une image ouvre celle-là, mais on veut
 * ensuite passer aux suivantes sans refermer. Il faut donc la liste entière,
 * et le rendu ne la donne pas — chaque `<img>` s'ignore l'une l'autre.
 *
 * Les blocs de code fencés sont sautés, comme partout ailleurs : un
 * `![](…)` montré en exemple documente une syntaxe, il n'illustre rien.
 */

export type WikiImage = { url: string; alt: string };

// `![alt](url)`, sans titre optionnel : l'application n'en écrit pas, et les
// accepter demanderait de distinguer l'espace d'un nom de fichier.
const IMAGE_RE = /!\[([^\]\n]*)\]\(([^)\s]+)\)/g;

export function extractImages(markdown: string): WikiImage[] {
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const fenceTracker = createFenceTracker();
  const images: WikiImage[] = [];

  for (const line of lines) {
    if (fenceTracker.consume(line)) continue;

    IMAGE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMAGE_RE.exec(line))) {
      images.push({ alt: match[1].trim(), url: match[2] });
    }
  }

  return images;
}
