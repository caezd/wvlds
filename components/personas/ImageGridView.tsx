"use client";

import { useState } from "react";
import { ImageLightbox } from "@/components/chatrooms/ImageLightbox";
import { supabaseThumb } from "@/lib/storage";
import { resolvePersonaImageGrid, IMAGE_GRID_ROW_HEIGHT } from "./personaImageGrid";
import type { PersonaGridImage } from "@/types/personas";
import { cn } from "@/lib/utils";

function Thumb({
  img,
  onClick,
}: {
  img: { url: string; caption?: string };
  onClick: () => void;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full overflow-hidden rounded-md focus:outline-none sm:h-full"
    >
      {/* Dimensions intrinsèques inconnues (non stockées) — sous `sm`, la
          largeur de la case reste son %age de grille habituel, mais la
          hauteur suit la propre proportion de l'image, sans recadrage ni
          marge (ni `cover`, ni `contain`). Dès `sm`, la grille en lignes
          impose une hauteur commune par ligne : l'image y est alors
          contenue en entier (jamais recadrée) via `object-contain`. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbFailed ? img.url : (supabaseThumb(img.url, 600) ?? img.url)}
        onError={() => setThumbFailed(true)}
        alt={img.caption ?? ""}
        loading="lazy"
        draggable={false}
        className="block h-auto w-full transition-opacity hover:opacity-90 sm:h-full sm:object-contain"
      />
    </button>
  );
}

/**
 * Rendu lecture seule de la grille d'images — pure grille CSS, aucun état de
 * geste (voir ImageGridField dans SectionFieldsEditor.tsx pour l'édition) :
 * même séparation édition/lecture que WorldHomeGridView.tsx, dont ce
 * composant reprend la technique de positionnement (custom properties CSS
 * `--gc`/`--gr`). Contrairement à WorldHomeGridView (qui replie tout sur une
 * seule colonne sous `sm`), la grille à 6 colonnes reste active sur mobile :
 * la largeur d'une image reste le même %age du panneau qu'en édition, seule
 * sa hauteur devient naturelle (voir Thumb) au lieu d'une ligne à hauteur
 * fixe. `grid-cols-6` est codé en dur comme dans
 * worldHomeGrid.ts/WorldHomeGridEditor.tsx — une classe Tailwind générée
 * dynamiquement à partir de IMAGE_GRID_COLS ne serait pas détectée par le
 * scanner JIT de Tailwind.
 */
export function ImageGridView({ images }: { images: PersonaGridImage[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const items = resolvePersonaImageGrid(images);
  if (!items.length) return null;

  const lightboxItems = items.map((img) => ({ url: img.url, name: img.caption ?? "Image" }));

  return (
    <>
      <div
        className="grid grid-cols-6 gap-1"
        style={{ "--row-h": `${IMAGE_GRID_ROW_HEIGHT}px` } as React.CSSProperties}
      >
        {items.map((item, i) => (
          <div
            key={item.id}
            style={{
              "--gc": `${item.x + 1} / span ${item.w}`,
              "--gr": `${item.y + 1}`,
            } as React.CSSProperties}
            className={cn(
              "min-w-0 overflow-hidden rounded-md [grid-column:var(--gc)] [grid-row:var(--gr)] sm:h-(--row-h)",
              item.bg && "bg-muted",
            )}
          >
            <Thumb img={item} onClick={() => setLightboxIndex(i)} />
          </div>
        ))}
      </div>
      {lightboxIndex !== null && (
        <ImageLightbox
          items={lightboxItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
