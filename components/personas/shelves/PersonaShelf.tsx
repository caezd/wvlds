import type { ReactNode } from "react";

import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/utils";

/** Les colonnes des tuiles : aussi nombreuses que la largeur le permet. */
const TILE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(132px,1fr))]";

/**
 * Le mur d'une étagère (vues « Par joueur » et « Par groupe ») : l'en-tête
 * au-dessus — avatar du joueur (ou trait de la couleur du groupe), nom,
 * chiffres —, puis les personas en grille dense, sur autant de lignes qu'il faut.
 */
export function PersonaWall({
  title,
  accent,
  color,
  note,
  stat,
  children,
}: {
  title: ReactNode;
  /** À gauche du nom : l'avatar du joueur, la pastille des PNJ… À défaut, un trait de `color` au-dessus. */
  accent?: ReactNode;
  color?: string | null;
  /** Une mise en garde (joueur en pause ou absent). */
  note?: ReactNode;
  stat?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {accent}
        <div className="flex min-w-0 flex-col gap-0.5">
          {!accent && (
            <span aria-hidden className={cn("mb-1 h-[3px] w-6 rounded-full", !color && "bg-border")} style={color ? { backgroundColor: color } : undefined} />
          )}
          <h3 className="truncate text-sm font-semibold leading-tight text-foreground">{title}</h3>
          {note && <span className="text-xs leading-snug text-warning">{note}</span>}
          {stat && <span className="text-xs text-muted-foreground">{stat}</span>}
        </div>
      </div>
      <div className={cn(TILE_GRID, "grid-flow-dense gap-1")}>{children}</div>
    </section>
  );
}

/** La grille continue du mode Liste, sans en-tête ; les lettres l'entrecoupent. */
export function PersonaListGrid({ children }: { children: ReactNode }) {
  return <div className={cn(TILE_GRID, "gap-3")}>{children}</div>;
}

/** L'intercalaire d'une lettre, pleine largeur dans la grille du mode Liste. */
export function LetterDivider({ letter }: { letter: string }) {
  return (
    <SectionLabel
      as="div"
      id={letterAnchor(letter)}
      className="col-span-full flex scroll-mt-14 items-center gap-2.5 pt-2.5"
    >
      {letter}
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
    </SectionLabel>
  );
}

export function letterAnchor(letter: string) {
  return `personas-letter-${letter === "#" ? "other" : letter}`;
}
