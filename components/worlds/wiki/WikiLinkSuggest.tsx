"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";

import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { VALID_LUCIDE_ICONS } from "@/components/ui/LucideIconPicker";
import { cn } from "@/lib/utils";
import type { CaretPosition } from "@/lib/caretPosition";
import type { WikiPage } from "./WorldWiki";

/**
 * Liste des pages proposées pendant qu'on écrit un lien `[[…]]`.
 *
 * Posée sous la ligne en cours, et non dans un coin : c'est là que l'œil est
 * déjà. Elle ne prend jamais le focus — le champ le garde, sinon la frappe
 * s'interromprait à chaque suggestion — d'où le clavier piloté par l'appelant
 * et le `onMouseDown` retenu sur chaque entrée.
 */
export function WikiLinkSuggest({
  pages,
  actif,
  position,
  onChoisir,
  onSurvoler,
}: {
  pages: WikiPage[];
  /** Rang de la proposition mise en avant, celle qu'Entrée choisira. */
  actif: number;
  position: CaretPosition;
  onChoisir: (page: WikiPage) => void;
  onSurvoler: (rang: number) => void;
}) {
  const t = useTranslations("wiki");

  return (
    <div
      role="listbox"
      aria-label={t("linkSuggestLabel")}
      className="absolute z-30 max-h-56 w-64 overflow-y-auto rounded-md border border-border-soft bg-popover p-1 shadow-md"
      style={{
        // Sous la ligne, jamais dessus : elle cacherait ce qu'on vient
        // d'écrire, c'est-à-dire ce qui filtre la liste.
        top: position.top + position.lineHeight,
        left: position.left,
      }}
    >
      {pages.map((page, rang) => (
        <button
          key={page.id}
          type="button"
          role="option"
          aria-selected={rang === actif}
          // Le champ garde le focus, donc son curseur : c'est lui qui dit où
          // le lien s'écrit.
          onMouseDown={e => e.preventDefault()}
          onClick={() => onChoisir(page)}
          onMouseEnter={() => onSurvoler(rang)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm",
            rang === actif ? "bg-secondary text-foreground" : "text-muted-foreground",
          )}
        >
          {page.icon && VALID_LUCIDE_ICONS.has(page.icon) ? (
            <LazyLucideIcon name={page.icon} className="h-3 w-3 shrink-0" />
          ) : (
            <FileText className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">{page.title}</span>
        </button>
      ))}
    </div>
  );
}
