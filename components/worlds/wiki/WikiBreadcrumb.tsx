"use client";

import { Fragment } from "react";
import type { WikiPage } from "./WorldWiki";

/**
 * Fil d'Ariane des dossiers ancêtres d'une page, du plus ancien au plus proche.
 *
 * Il vit dans l'en-tête principal, à la suite du nom du wiki, et se sépare par
 * des barres obliques comme celui d'un salon : c'est le même geste — dire d'où
 * vient ce qu'on lit — et il doit se lire pareil d'un onglet à l'autre.
 */
export function WikiBreadcrumb({
  ancestors,
  onExpandFolder,
}: {
  ancestors: WikiPage[];
  onExpandFolder: (folderId: string) => void;
}) {
  if (!ancestors.length) return null;

  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
      {ancestors.map(ancestor => (
        <Fragment key={ancestor.id}>
          <span aria-hidden className="shrink-0 text-muted-foreground/50">/</span>
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
