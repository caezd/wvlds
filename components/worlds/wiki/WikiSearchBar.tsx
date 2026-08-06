"use client";

import { useTranslations } from "next-intl";
import { FileText, Search, X } from "lucide-react";
import type { WikiPage } from "./WorldWiki";

export type WikiSearchResult = {
  page: WikiPage;
  /** Chemin des dossiers parents, ex: "Lieux / Villes". */
  path: string;
  /** Extrait du contenu autour du terme recherché (vide si le titre seul correspond). */
  excerpt: string;
};

export function WikiSearchBar({
  query,
  onQueryChange,
  results,
  onSelectResult,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  /** `null` = pas de recherche active (arbre affiché à la place). */
  results: WikiSearchResult[] | null;
  onSelectResult: (pageId: string) => void;
}) {
  const t = useTranslations("wiki");

  return (
    <div className="border-b border-border-soft p-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-md border border-border-soft bg-transparent py-1 pl-7 pr-7 text-sm outline-none focus:border-primary/50"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-1.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={t("clearSearch")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {results !== null && (
        <div className="mt-1.5 max-h-64 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-1 py-1 text-xs italic text-muted-foreground">{t("searchNoResults")}</p>
          ) : (
            results.map(r => (
              <button
                key={r.page.id}
                type="button"
                onClick={() => onSelectResult(r.page.id)}
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-secondary"
              >
                <span className="flex items-center gap-1.5 text-sm">
                  <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                  {r.page.title}
                </span>
                {r.path && <span className="text-xs text-muted-foreground">{r.path}</span>}
                {r.excerpt && (
                  <span className="line-clamp-1 text-xs text-muted-foreground/80">{r.excerpt}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
