import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import stripMarkdown from "strip-markdown";
import { transformStyledSpans } from "@/lib/textStyledSpans";
import { transformAngleCallouts } from "@/components/MarkdownRenderer";

/**
 * Convertit le markdown d'un message (avec la syntaxe étendue de l'app —
 * spans stylés [#hex]…[/]/++…++, callouts <<…>>) en texte brut lisible, en
 * réutilisant le même pipeline de normalisation que MarkdownContent — sinon
 * ces marqueurs apparaîtraient tels quels au lieu d'être dépouillés.
 *
 * strip-markdown + remark-stringify plutôt qu'un simple mdast-util-to-string :
 * ce dernier concatène tout le texte sans rien entre les blocs (titres,
 * paragraphes, items de liste collés bout à bout) — stringify réinsère les
 * sauts de ligne attendus entre blocs.
 */
export function markdownToPlainText(content: string): string {
  const normalized = transformAngleCallouts(transformStyledSpans(content));
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(stripMarkdown)
    .use(remarkStringify)
    .processSync(normalized);
  return String(file).trim();
}
