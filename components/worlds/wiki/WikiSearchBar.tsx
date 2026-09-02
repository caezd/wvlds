"use client";

import { useTranslations } from "next-intl";
import { FileText, NotebookText, Search, X } from "lucide-react";
import type { WikiPage } from "./WorldWiki";

export type WikiSearchResult = {
  page: WikiPage;
  /** Chemin des dossiers parents, ex: "Lieux / Villes". */
  path: string;
  /** Extrait du contenu autour du terme recherché (vide si le titre seul correspond). */
  excerpt: string;
  /**
   * Fiche de notes trouvée, quand la correspondance ne vient pas de la page.
   *
   * C'est elle qu'on nomme alors, et la page devient le chemin pour y aller —
   * annoncer « Le Hub central » à qui a cherché « clé rouillée » ne dirait pas
   * ce qui a été trouvé.
   */
  note: { id: string; title: string } | null;
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
  onSelectResult: (result: WikiSearchResult) => void;
}) {
  const t = useTranslations("wiki");

  return (
    // Ni bordure ni marge verticale : la barre vit maintenant dans le bandeau
    // de la colonne, qui porte déjà le trait — et qui n'en porte pas dans le
    // tiroir, où il n'y a rien à aligner.
    <div className="relative">
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
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border-soft bg-popover p-1 shadow-md">
          {results.length === 0 ? (
            <p className="px-1 py-1 text-xs italic text-muted-foreground">{t("searchNoResults")}</p>
          ) : (
            results.map(r => (
              <button
                key={r.note ? r.note.id : r.page.id}
                type="button"
                onClick={() => onSelectResult(r)}
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-secondary"
              >
                {/* Une fiche se nomme elle-même, et la page devient le chemin
                    pour y aller : annoncer « Le Hub central » à qui a cherché
                    « clé rouillée » ne dirait pas ce qui a été trouvé. */}
                <span className="flex items-center gap-1.5 text-sm">
                  {r.note ? (
                    <NotebookText className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  {r.note ? r.note.title : r.page.title}
                </span>
                {(r.note || r.path) && (
                  <span className="text-xs text-muted-foreground">
                    {[r.path, r.note ? r.page.title : null].filter(Boolean).join(" / ")}
                  </span>
                )}
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
