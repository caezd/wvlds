"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type * as React from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Expand, GripVertical, Loader2, MoveHorizontal, Plus, Square, SquareDashed, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { supabaseThumb } from "@/lib/storage";
import { toWebP } from "@/lib/imageUtils";
import { nomDeFichierPourType } from "@/lib/storagePaths";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "@/components/chatrooms/ImageLightbox";
import type { PersonaGridImage } from "@/types/personas";
import {
  compactImageGridRows,
  IMAGE_GRID_COLS,
  IMAGE_GRID_ROW_HEIGHT,
  MIN_IMAGE_W,
  moveImage,
  resizeImage,
  resolvePersonaImageGrid,
  toPersonaGridImages,
  type PersonaImageGridItem,
} from "../personaImageGrid";

function GridImageThumb({ url }: { url: string }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  return (
    <Image
      src={thumbFailed ? url : (supabaseThumb(url, 300) ?? url)}
      onError={() => setThumbFailed(true)}
      alt=""
      fill
      sizes="120px"
      className="object-contain"
      loading="lazy"
      draggable={false}
    />
  );
}

/** Largeur de CONTENU du conteneur (hors `border`/`padding`) — voir le même
 *  utilitaire, avec la même justification, dans WorldHomeGridEditor.tsx.
 *  Dupliqué plutôt qu'importé : ce fichier ne doit pas dépendre d'un module
 *  spécifique aux blocs de page d'accueil pour une simple mesure de boîte. */
function getContentWidth(node: HTMLElement): number {
  const style = window.getComputedStyle(node);
  const px = (v: string) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const inset =
    px(style.borderLeftWidth) + px(style.borderRightWidth) + px(style.paddingLeft) + px(style.paddingRight);
  const border = node.getBoundingClientRect().width;
  if (border > 0) return Math.max(0, border - inset);
  return Math.max(0, node.clientWidth - px(style.paddingLeft) - px(style.paddingRight));
}

function useMeasuredWidth(): { containerRef: React.RefObject<HTMLDivElement | null>; width: number } {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    setWidth(Math.round(getContentWidth(node)));
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { containerRef, width };
}

type ImageDropTarget = { row: number; col: number; asNewRow: boolean };
type ImageResizePreview = { id: string; neighborId: string | null; dx: number };
const IMAGE_GRID_GAP = 8;
const NEW_ROW_BAND = 1 / 3;

/**
 * Grille d'images modulable : chaque image a une largeur réglable (glisser
 * la poignée en coin — en tandem avec sa voisine de droite si elle existe,
 * sinon libre jusqu'à occuper toute la largeur de la ligne) et peut être
 * déplacée vers une autre ligne — même moteur que la grille de blocs de la
 * page d'accueil d'un monde (components/worlds/home/worldHomeGrid.ts +
 * WorldHomeGridEditor.tsx), adapté aux images dans personaImageGrid.ts. Voir
 * ce fichier pour le choix d'un modèle "lignes de colonnes" plutôt qu'un
 * moteur de layout tiers.
 */
export function ImageGridField({
  fieldId,
  initialImages,
  personaId,
  userId,
  onSave,
}: {
  fieldId: string;
  initialImages: PersonaGridImage[];
  personaId: string;
  userId: string | null;
  onSave: (images: PersonaGridImage[]) => void;
}) {
  const tPersonas = useTranslations("personas");
  const supabase = createClient();
  const [items, setItems] = useState<PersonaImageGridItem[]>(() => resolvePersonaImageGrid(initialImages));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { containerRef, width } = useMeasuredWidth();
  const gridRef = useRef<HTMLDivElement>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<ImageDropTarget | null>(null);
  const [resizePreview, setResizePreview] = useState<ImageResizePreview | null>(null);
  const rowCount = items.reduce((max, i) => Math.max(max, i.y + 1), 0);
  const colPitch = (width + IMAGE_GRID_GAP) / IMAGE_GRID_COLS;
  const rowPitch = IMAGE_GRID_ROW_HEIGHT + IMAGE_GRID_GAP;

  function persist(next: PersonaImageGridItem[]) {
    setItems(next);
    onSave(toPersonaGridImages(next));
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !userId) return;
    setUploading(true);
    setUploadError(null);
    // En parallèle plutôt qu'en série : ajouter plusieurs images à une galerie
    // enchaînait autant de cycles compression + envoi. `toWebP` travaille dans
    // un web worker, et `Promise.all` conserve l'ordre de sélection.
    const settled = await Promise.all(
      Array.from(files).map(async (rawFile): Promise<PersonaGridImage | null> => {
        const file = await toWebP(rawFile);
        const path = `user-${userId}/section-images/${personaId}/${fieldId}/${nomDeFichierPourType(file.type)}`;
        const { error } = await supabase.storage.from("personas").upload(path, file, { upsert: false, contentType: file.type });
        if (error) return null;
        const { data } = supabase.storage.from("personas").getPublicUrl(path);
        return { id: path, url: data.publicUrl };
      }),
    );
    const added = settled.filter((img): img is PersonaGridImage => img !== null);
    if (added.length < settled.length) setUploadError("Certaines images n'ont pas pu être uploadées.");
    // Les nouvelles images n'ont pas encore de position — resolvePersonaImageGrid
    // les place automatiquement à la suite des images déjà positionnées.
    persist(resolvePersonaImageGrid([...toPersonaGridImages(items), ...added]));
    setUploading(false);
  }

  function removeImage(id: string) {
    persist(compactImageGridRows(items.filter((img) => img.id !== id)));
  }

  function toggleBg(id: string) {
    persist(items.map((img) => (img.id === id ? { ...img, bg: !img.bg } : img)));
  }

  function startResize(event: React.PointerEvent, item: PersonaImageGridItem) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startItems = items;
    // Voisine directe à droite, s'il y en a une : le redimensionnement se
    // fait alors en tandem avec elle (largeur totale de la paire préservée).
    // Sans voisine, l'image est libre de grandir jusqu'à occuper le reste de
    // la ligne (jusqu'à 100% de large si elle est seule sur sa ligne).
    const neighbor = items.find((i) => i.y === item.y && i.x === item.x + item.w) ?? null;
    setActiveId(item.id);
    setResizePreview({ id: item.id, neighborId: neighbor?.id ?? null, dx: 0 });

    const minDx = (MIN_IMAGE_W - item.w) * colPitch;
    const maxDx = neighbor
      ? (neighbor.w - MIN_IMAGE_W) * colPitch
      : (IMAGE_GRID_COLS - item.x - item.w) * colPitch;

    let dx = 0;
    const onPointerMove = (moveEvent: PointerEvent) => {
      dx = Math.min(Math.max(moveEvent.clientX - startX, minDx), maxDx);
      setResizePreview({ id: item.id, neighborId: neighbor?.id ?? null, dx });
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      setActiveId(null);
      setResizePreview(null);
      const columns = Math.round(dx / colPitch);
      if (columns !== 0) persist(resizeImage(startItems, item.id, "e", columns));
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function dropTarget(clientX: number, clientY: number, colOffset: number): ImageDropTarget | null {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const rowFloat = (clientY - rect.top) / rowPitch;
    const row = Math.max(0, Math.floor(rowFloat));
    const withinRow = rowFloat - Math.floor(rowFloat);
    // `colOffset` = distance (en colonnes) entre le point où l'image a été
    // saisie et son propre bord gauche — sans ça, le bord gauche de l'image
    // saute sous le curseur au premier mouvement, peu importe où elle avait
    // été attrapée (poignée à gauche vs n'importe où sur la vignette).
    const col = (clientX - rect.left) / colPitch - colOffset;

    if (withinRow < NEW_ROW_BAND) return { row, col, asNewRow: true };
    if (withinRow > 1 - NEW_ROW_BAND) return { row: row + 1, col, asNewRow: true };
    return { row, col, asNewRow: false };
  }

  function startMove(event: React.PointerEvent, item: PersonaImageGridItem) {
    if (event.button !== 0) return;
    // Les boutons d'action (agrandir/supprimer) vivent DANS la tuile — sans
    // ce garde-fou, un clic dessus capturerait déjà le pointeur ici et
    // déclencherait un déplacement au lieu de l'action.
    if (event.target instanceof Element && event.target.closest("button")) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = gridRef.current?.getBoundingClientRect();
    const colOffset = rect ? (event.clientX - rect.left) / colPitch - item.x : 0;

    setActiveId(item.id);
    let target: ImageDropTarget | null = null;
    let moved = false;

    const onPointerMove = (moveEvent: PointerEvent) => {
      moved = true;
      target = dropTarget(moveEvent.clientX, moveEvent.clientY, colOffset);
      setDropPreview(target);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      setActiveId(null);
      setDropPreview(null);
      if (moved && target) {
        persist(moveImage(items, item.id, target.row, target.col, target.asNewRow));
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  return (
    <div className="space-y-2 pr-24">
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      {lightboxIndex !== null && (
        <ImageLightbox
          items={items.map((img) => ({ url: img.url, name: img.caption ?? "Image" }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      <div ref={containerRef}>
        {items.length > 0 && (
          <div
            ref={gridRef}
            className="grid grid-cols-6"
            style={{ gap: IMAGE_GRID_GAP, gridAutoRows: `${IMAGE_GRID_ROW_HEIGHT}px` }}
          >
            {activeId && rowCount > 0 &&
              Array.from({ length: IMAGE_GRID_COLS - 1 }, (_, i) => (
                <div
                  key={i}
                  aria-hidden
                  style={{ gridColumn: i + 2, gridRow: `1 / ${rowCount + 1}`, marginLeft: -IMAGE_GRID_GAP / 2 }}
                  className="pointer-events-none z-0 justify-self-start self-stretch border-l border-dashed border-border-soft"
                />
              ))}

            {items.map((item, i) => (
              <div
                key={item.id}
                style={{
                  gridColumn: `${item.x + 1} / span ${item.w}`,
                  gridRow: item.y + 1,
                  ...(resizePreview?.id === item.id && { marginRight: -resizePreview.dx }),
                  ...(resizePreview?.neighborId === item.id && { marginLeft: resizePreview.dx }),
                }}
                className={cn(
                  "group/img relative touch-none select-none overflow-hidden rounded-md",
                  item.bg && "bg-muted",
                  (activeId === item.id || resizePreview?.id === item.id || resizePreview?.neighborId === item.id) &&
                    "z-10 opacity-50",
                )}
                onPointerDown={(event) => startMove(event, item)}
              >
                <GridImageThumb url={item.url} />
                {/* Visibles en permanence sur mobile (pas de survol tactile),
                    réservés au survol ou au focus clavier dès `sm` pour ne pas
                    encombrer une grille dense à la souris. */}
                <div className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover/img:opacity-100 sm:group-focus-within/img:opacity-100">
                  <GripVertical className="h-3 w-3" />
                </div>
                <div className="absolute inset-0 flex items-start justify-end gap-1 p-1 sm:hidden sm:group-hover/img:flex sm:group-focus-within/img:flex">
                  <button
                    type="button"
                    onClick={() => toggleBg(item.id)}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    aria-label={item.bg ? tPersonas("hideImageBackground") : tPersonas("showImageBackground")}
                  >
                    {item.bg ? <Square className="h-3 w-3" /> : <SquareDashed className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    aria-label="Agrandir"
                  >
                    <Expand className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(item.id)}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive"
                    aria-label={tPersonas("deleteImage")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Redimensionner"
                  onPointerDown={(event) => startResize(event, item)}
                  className="absolute bottom-1 right-1 flex h-5 w-5 touch-none cursor-ew-resize items-center justify-center rounded-full bg-black/60 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover/img:opacity-100 sm:focus-visible:opacity-100"
                >
                  <MoveHorizontal className="h-3 w-3" />
                </button>
              </div>
            ))}

            {dropPreview?.asNewRow && rowCount > 0 && (
              <div
                aria-hidden
                style={{
                  gridColumn: "1 / -1",
                  gridRow: Math.min(dropPreview.row + 1, rowCount),
                  alignSelf: dropPreview.row >= rowCount ? "end" : "start",
                  [dropPreview.row >= rowCount ? "marginBottom" : "marginTop"]: -(IMAGE_GRID_GAP / 2 + 1),
                  height: 2,
                }}
                className="pointer-events-none z-20 rounded-full bg-primary"
              />
            )}
            {dropPreview && !dropPreview.asNewRow && activeId && (() => {
              // Projection exacte de l'atterrissage : on rejoue moveImage
              // avec la cible courante et on lit la position/largeur
              // résultante de l'image déplacée — garantit que le fantôme
              // affiché correspond toujours à ce que produira le dépôt
              // (recentrage sur sa ligne, insertion + redistribution, etc.).
              const placed = moveImage(items, activeId, dropPreview.row, dropPreview.col, false).find(
                (i) => i.id === activeId,
              );
              if (!placed) return null;
              return (
                <div
                  aria-hidden
                  style={{ gridColumn: `${placed.x + 1} / span ${placed.w}`, gridRow: placed.y + 1 }}
                  className="pointer-events-none z-20 rounded-md border-2 border-dashed border-primary bg-primary/15"
                />
              );
            })()}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || !userId}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border-soft text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
        aria-label={tPersonas("addImages")}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {tPersonas("addImages")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}
