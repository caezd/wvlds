import { Dices } from "lucide-react";

import { cn } from "@/lib/utils";

/** Le contour de chaque dé standard, sur une grille de 24. */
const SHAPES: Record<number, { points?: string; rect?: true; textY: number }> = {
  4: { points: "12,3 21.5,20 2.5,20", textY: 16.2 },
  6: { rect: true, textY: 14.3 },
  8: { points: "12,2 22,12 12,22 2,12", textY: 14.3 },
  10: { points: "12,2 21,10 12,22 3,10", textY: 13.6 },
  12: { points: "12,2.5 21.5,9.4 17.9,20.5 6.1,20.5 2.5,9.4", textY: 15 },
  20: { points: "12,2 20.7,7 20.7,17 12,22 3.3,17 3.3,7", textY: 14.3 },
  100: { points: "12,2 21,10 12,22 3,10", textY: 13.6 },
};

/**
 * La silhouette d'un dé : son contour et son nombre de faces, à la couleur du
 * texte (`currentColor`). Un dé personnalisé (`faces` nul) prend l'icône Dés.
 * Purement décorative : le nom du dé est dit à côté.
 */
export function DieGlyph({ faces, className }: { faces: number | null; className?: string }) {
  const shape = faces ? SHAPES[faces] : undefined;
  if (!shape) return <Dices className={cn("size-5", className)} aria-hidden />;
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
      {shape.rect ? <rect x="3" y="3" width="18" height="18" rx="3.5" /> : <polygon points={shape.points} />}
      <text
        x="12"
        y={shape.textY}
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize={faces === 100 ? 5 : 6.5}
        fontWeight={600}
      >
        {faces}
      </text>
    </svg>
  );
}
