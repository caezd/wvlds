"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import type { WikiPage } from "./WorldWiki";

/** Fil d'Ariane des dossiers ancêtres d'une page, du plus ancien au plus proche. */
export function WikiBreadcrumb({
  ancestors,
  onExpandFolder,
}: {
  ancestors: WikiPage[];
  onExpandFolder: (folderId: string) => void;
}) {
  if (!ancestors.length) return null;

  return (
    <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {ancestors.map((ancestor, i) => (
        <Fragment key={ancestor.id}>
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
          <button
            type="button"
            onClick={() => onExpandFolder(ancestor.id)}
            className="truncate hover:text-foreground hover:underline"
          >
            {ancestor.title}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}
