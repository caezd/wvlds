"use client";

import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";

import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { VALID_LUCIDE_ICONS } from "@/components/ui/LucideIconPicker";
import { formatDaysAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { recentPages } from "@/lib/wikiRecent";
import type { WikiPage } from "./WorldWiki";

/**
 * Les pages par date de dernière modification, à la place de l'arbre.
 *
 * Même colonne, même geste que la recherche : la liste prend la place de
 * l'arbre le temps qu'on la consulte, et un clic ouvre la page. Un éditeur y
 * voit aussi les brouillons en attente ; un lecteur, que ce qui est publié.
 */
export function WikiRecentList({
  pages,
  editor,
  selectedId,
  onSelect,
}: {
  pages: WikiPage[];
  editor: boolean;
  selectedId: string | null;
  onSelect: (pageId: string) => void;
}) {
  const t = useTranslations("wiki");
  const entries = recentPages(pages, editor);

  if (entries.length === 0) {
    return <p className="px-2 py-1 text-xs italic text-muted-foreground">{t("noRecent")}</p>;
  }

  return (
    <ul className="flex flex-col gap-0.5 px-1">
      {entries.map(({ page, at, hasNewerDraft }) => (
        <li key={page.id}>
          <button
            type="button"
            onClick={() => onSelect(page.id)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-secondary/60",
              selectedId === page.id && "bg-secondary font-medium text-foreground",
            )}
          >
            {page.icon && VALID_LUCIDE_ICONS.has(page.icon) ? (
              <LazyLucideIcon name={page.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate">{page.title}</span>
            {hasNewerDraft && (
              <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
                {t("draftBadge")}
              </span>
            )}
            <time dateTime={at} className="shrink-0 text-xs text-muted-foreground">
              {formatDaysAgo(at)}
            </time>
          </button>
        </li>
      ))}
    </ul>
  );
}
