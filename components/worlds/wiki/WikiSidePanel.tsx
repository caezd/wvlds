"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { MessagesSquare, StickyNote, X } from "lucide-react";

import { cn } from "@/lib/utils";

/** Les deux contenus que la colonne latérale d'une page sait afficher. */
export type WikiSideTab = "comments" | "notes";

/**
 * Colonne latérale d'une page de wiki — un seul panneau pour deux contenus.
 *
 * Les commentaires ancrés et les notes de la page occupaient d'abord chacun un
 * côté de l'écran. À deux panneaux ouverts, le texte se retrouvait pris en
 * étau dans une colonne étroite alors qu'on ne consulte, en pratique, que l'un
 * des deux à la fois. Ils partagent donc la même place, et l'onglet dit lequel
 * on regarde.
 */
export function WikiSidePanel({
  tab,
  onTabChange,
  onClose,
  /** Fils de discussion ouverts — affiché sur l'onglet des commentaires. */
  openCommentCount,
  children,
}: {
  tab: WikiSideTab;
  onTabChange: (tab: WikiSideTab) => void;
  onClose: () => void;
  openCommentCount: number;
  children: React.ReactNode;
}) {
  const tAnnotations = useTranslations("wiki.annotations");
  const tNotes = useTranslations("wiki.notes");
  const tCommon = useTranslations("common");

  const onglets: { id: WikiSideTab; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: "comments",
      label: tAnnotations("title"),
      icon: <MessagesSquare className="h-3.5 w-3.5" />,
      count: openCommentCount,
    },
    {
      id: "notes",
      label: tNotes("title"),
      icon: <StickyNote className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <aside
      // L'étiquette suit l'onglet : un lecteur d'écran doit entendre ce que la
      // colonne montre, pas le nom générique du meuble qui l'accueille.
      aria-label={tab === "notes" ? tNotes("title") : tAnnotations("title")}
      className="flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-border-soft"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border-soft px-2 py-1.5">
        <div role="tablist" className="flex min-w-0 flex-1 items-center gap-0.5">
          {onglets.map(o => (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={tab === o.id}
              onClick={() => onTabChange(o.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                tab === o.id
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              {o.icon}
              {o.label}
              {o.count ? (
                <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
                  {o.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon("close")}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {children}
    </aside>
  );
}
