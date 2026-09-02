"use client";

import { useTranslations } from "next-intl";
import { FileText, Hash } from "lucide-react";

import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { VALID_LUCIDE_ICONS } from "@/components/ui/LucideIconPicker";
import { cn } from "@/lib/utils";
import type { CaretPosition } from "@/lib/caretPosition";

/** Une proposition, page ou section, telle que la liste l'affiche. */
export type LinkSuggestion = {
  /** Clé de rendu : l'identifiant d'une page, ou son slug plus l'ancre. */
  id: string;
  label: string;
  icon: string | null;
  /** Ce qui s'écrira entre les crochets. */
  insert: string;
  /** Une section se montre autrement d'une page — le repère n'est pas le même. */
  isSection: boolean;
};

/**
 * Liste des propositions pendant qu'on écrit un lien `[[…]]`.
 *
 * Posée sous la ligne en cours, et non dans un coin : c'est là que l'œil est
 * déjà. Elle ne prend jamais le focus — le champ le garde, sinon la frappe
 * s'interromprait à chaque suggestion — d'où le clavier piloté par l'appelant
 * et le `onMouseDown` retenu sur chaque entrée.
 */
export function WikiLinkSuggest({
  items,
  active,
  position,
  onChoose,
  onHover,
}: {
  items: LinkSuggestion[];
  /** Rang de la proposition mise en avant, celle qu'Entrée choisira. */
  active: number;
  position: CaretPosition;
  onChoose: (item: LinkSuggestion) => void;
  onHover: (rank: number) => void;
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
      {items.map((item, rank) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={rank === active}
          // Le champ garde le focus, donc son curseur : c'est lui qui dit où
          // le lien s'écrit.
          onMouseDown={e => e.preventDefault()}
          onClick={() => onChoose(item)}
          onMouseEnter={() => onHover(rank)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm",
            rank === active ? "bg-secondary text-foreground" : "text-muted-foreground",
          )}
        >
          {item.isSection ? (
            <Hash className="h-3 w-3 shrink-0" />
          ) : item.icon && VALID_LUCIDE_ICONS.has(item.icon) ? (
            <LazyLucideIcon name={item.icon} className="h-3 w-3 shrink-0" />
          ) : (
            <FileText className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
