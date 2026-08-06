import { createFenceTracker } from "@/lib/textStyledSpans";
import { slugify } from "@/lib/slug";

export type WikiHeading = { level: number; text: string; id: string };

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/**
 * Extrait les titres ATX (`#`…`######`) d'un contenu markdown, dans l'ordre
 * du document — ignore les blocs de code fencés. Les ids générés (slugify,
 * dédupliqués par occurrence) doivent rester synchronisés avec ceux posés
 * sur les balises de titre par MarkdownRenderer (même algorithme).
 */
export function extractHeadings(markdown: string): WikiHeading[] {
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const fenceTracker = createFenceTracker();
  const seen = new Map<string, number>();
  const headings: WikiHeading[] = [];

  for (const line of lines) {
    if (fenceTracker.consume(line)) continue;

    const m = line.match(HEADING_RE);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    if (!text) continue;

    let id = slugify(text);
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count + 1}`;

    headings.push({ level, text, id });
  }

  return headings;
}
