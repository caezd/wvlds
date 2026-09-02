"use client";

import { useTranslations } from "next-intl";
import { FileText, NotebookText } from "lucide-react";

import type { WikiSearchHit, WikiSearchPage } from "@/lib/wikiSearch";

/**
 * Les pages et fiches du wiki qui répondent à la recherche libre.
 *
 * Le centre de recherche ne fouillait que les messages : depuis un salon, le
 * wiki était invisible. Ses résultats viennent en tête — ils sont peu nombreux
 * et disent souvent tout de suite ce qu'on cherchait — puis les messages.
 */
export function SearchWikiResults({
  hits,
  pagesById,
  onSelect,
}: {
  hits: WikiSearchHit[];
  pagesById: Map<string, WikiSearchPage>;
  onSelect: (slug: string) => void;
}) {
  const t = useTranslations("chatrooms");
  if (hits.length === 0) return null;

  return (
    <section className="mb-4" aria-label={t("search.wikiResults")}>
      <h3 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("search.wikiResults")}
      </h3>
      <ul className="flex flex-col gap-0.5">
        {hits.map(hit => {
          const page = pagesById.get(hit.pageId);
          if (!page) return null;
          return (
            <li key={hit.note ? hit.note.id : hit.pageId}>
              <button
                type="button"
                onClick={() => onSelect(page.slug)}
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-secondary"
              >
                {/* Une fiche se nomme elle-même, et la page devient le chemin
                    pour y aller — comme dans la recherche du wiki. */}
                <span className="flex items-center gap-1.5 text-sm">
                  {hit.note
                    ? <NotebookText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    : <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  {hit.note ? hit.note.title : page.title}
                </span>
                {hit.note && <span className="text-xs text-muted-foreground">{page.title}</span>}
                {hit.excerpt && (
                  <span className="line-clamp-1 text-xs text-muted-foreground/80">{hit.excerpt}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
