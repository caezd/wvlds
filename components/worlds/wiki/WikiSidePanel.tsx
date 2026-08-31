"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { MessagesSquare, PanelRightClose, StickyNote } from "lucide-react";

import { cn } from "@/lib/utils";
import { WIKI_SUBHEADER } from "./wikiSubHeader";

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
 *
 * La colonne est permanente : le bouton qui l'ouvrait vivait dans l'en-tête de
 * la page, où il disputait sa place au titre dès que l'écran rétrécissait. Une
 * colonne toujours là ne bouscule rien, et les onglets suffisent à choisir ce
 * qu'on y lit.
 */
export function WikiSidePanel({
  tab,
  onTabChange,
  /** Fils de discussion ouverts — affiché sur l'onglet des commentaires. */
  openCommentCount,
  width,
  handleProps,
  onCollapse,
  children,
}: {
  tab: WikiSideTab;
  onTabChange: (tab: WikiSideTab) => void;
  openCommentCount: number;
  /** Largeur de la colonne, ou `"100%"` quand elle occupe un tiroir. */
  width: number | string;
  /**
   * Gestionnaires de la poignée de redimensionnement. Absents hors mode
   * modification : la largeur se règle où le reste de la page se règle, comme
   * pour l'arbre de navigation.
   */
  handleProps?: React.ComponentProps<"div">;
  /** Replie la colonne — absent dans le tiroir, qui se ferme autrement. */
  onCollapse?: () => void;
  children: React.ReactNode;
}) {
  const tAnnotations = useTranslations("wiki.annotations");
  const tNotes = useTranslations("wiki.notes");
  const tWiki = useTranslations("wiki");

  const onglets: { id: WikiSideTab; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: "notes",
      label: tNotes("title"),
      icon: <StickyNote className="h-3.5 w-3.5" />,
    },
    {
      id: "comments",
      label: tAnnotations("title"),
      icon: <MessagesSquare className="h-3.5 w-3.5" />,
      count: openCommentCount,
    },
  ];

  return (
    <>
      {handleProps && (
        <div
          className="group relative w-2 shrink-0 cursor-col-resize select-none"
          {...handleProps}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-soft transition-colors group-hover:bg-border" />
        </div>
      )}

      <aside
      // L'étiquette suit l'onglet : un lecteur d'écran doit entendre ce que la
      // colonne montre, pas le nom générique du meuble qui l'accueille.
      aria-label={tab === "notes" ? tNotes("title") : tAnnotations("title")}
      className="flex h-full min-h-0 shrink-0 flex-col border-l border-border-soft"
      style={{ width }}
    >
      {/* Soulignement plutôt que pastille pleine, comme la barre d'onglets
          partagée (components/ui/tab-bar.tsx) : même technique d'ombre `inset`,
          qui reste DANS la boîte du bouton là où une bordure ou une marge
          négative en gonfleraient la hauteur. */}
      {/* Segment droit du bandeau : même hauteur et même trait que les deux
          autres, pour qu'ils se lisent comme une seule ligne. */}
      <div className={cn(WIKI_SUBHEADER, "px-3")}>
        {/* Les onglets prennent toute la hauteur du bandeau, au lieu d'y être
            centrés : c'est ce qui pose leur bord inférieur exactement sur le
            trait du bandeau, et donc le soulignement de l'onglet actif dessus
            plutôt qu'au-dessus de lui. */}
        <div role="tablist" className="flex min-w-0 flex-1 items-stretch gap-4 self-stretch">
          {onglets.map(o => (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={tab === o.id}
              onClick={() => onTabChange(o.id)}
              className={cn(
                "flex items-center gap-1.5 px-0.5 py-2 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                tab === o.id
                  ? "text-foreground shadow-[inset_0_-2px_0_0_var(--color-accent)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.icon}
              {o.label}
              {o.count ? (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
                  {o.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label={tWiki("collapsePanel")}
            title={tWiki("collapsePanel")}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {children}
    </aside>
    </>
  );
}
