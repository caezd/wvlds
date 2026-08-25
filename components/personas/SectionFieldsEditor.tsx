"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type * as React from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { supabaseThumb } from "@/lib/storage";
import { toWebP } from "@/lib/imageUtils";
import type { PersonaSectionField, PersonaFieldType, PersonaStat, PersonaGridImage, InventoryItem, SkillItem, GaugeItem, TraitItem, TimelineItem, DlItem } from "@/types/personas";
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
} from "./personaImageGrid";
import { RpgIconPicker } from "./RpgIconPicker";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { ParagraphBlockEditor } from "@/components/chatrooms/composer/ParagraphBlockEditor";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import { ArrowUp, ArrowDown, Plus, Trash2, Type, AlignLeft, BarChart3, Minus, X, ImageIcon, Loader2, Expand, Backpack, Swords, Gauge, Quote, Tag, CalendarDays, Lock, LockOpen, List, GripVertical, MoveHorizontal, Square, SquareDashed } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WorldInventoryItem, WorldSkill } from "@/types/worlds";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "@/components/chatrooms/ImageLightbox";
import { useFeatureFlags } from "@/components/providers/FeatureFlagsProvider";

function makeStatId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function StatsField({
  initialItems,
  onSave,
}: {
  initialItems: PersonaStat[];
  onSave: (items: PersonaStat[]) => void;
}) {
  const [items, setItems] = useState<PersonaStat[]>(initialItems);

  function update(next: PersonaStat[]) {
    setItems(next);
    onSave(next);
  }

  function patch(id: string, key: keyof PersonaStat, val: string) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }

  function addStat() {
    update([...items, { id: makeStatId(), label: "", value: "", unit: "" }]);
  }

  function removeStat(id: string) {
    update(items.filter((it) => it.id !== id));
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
      {items.map((stat) => (
        <div
          key={stat.id}
          className="group/stat relative flex flex-col gap-1 rounded-lg border border-border-soft bg-muted/30 px-3 py-2"
        >
          <button
            type="button"
            onClick={() => removeStat(stat.id)}
            className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover/stat:flex"
            aria-label="Supprimer la stat"
          >
            <X className="h-2.5 w-2.5" />
          </button>
          <input
            value={stat.label}
            onChange={(e) => patch(stat.id, "label", e.target.value)}
            placeholder="AGI"
            className="w-full bg-transparent text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground outline-none placeholder:text-muted-foreground/40"
          />
          <div className="flex items-baseline gap-1">
            <input
              value={stat.value}
              onChange={(e) => patch(stat.id, "value", e.target.value)}
              placeholder="10"
              className="min-w-0 flex-1 bg-transparent text-lg font-semibold tabular-nums outline-none placeholder:text-muted-foreground/40"
            />
            <input
              value={stat.unit ?? ""}
              onChange={(e) => patch(stat.id, "unit", e.target.value)}
              placeholder="cm"
              className="w-8 shrink-0 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addStat}
        className="flex min-h-[3.75rem] items-center justify-center gap-1 rounded-lg border border-dashed border-border-soft text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> Stat
      </button>
    </div>
  );
}

function MarkdownTextField({
  initialText,
  onSave,
}: {
  initialText: string;
  onSave: (val: string) => void;
}) {
  const [value, setValue] = useState(initialText);

  return (
    <ParagraphBlockEditor
      value={value}
      onChange={(v) => {
        setValue(v);
        onSave(v);
      }}
      submitOnEnter={false}
      placeholder="Écris en markdown…"
      className="text-sm leading-relaxed font-mono pr-24"
    />
  );
}

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
    const added: { id: string; url: string }[] = [];
    let errored = false;
    for (const rawFile of Array.from(files)) {
      const file = await toWebP(rawFile);
      const path = `user-${userId}/section-images/${personaId}/${fieldId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("personas").upload(path, file, { upsert: false, contentType: file.type });
      if (error) { errored = true; continue; }
      const { data } = supabase.storage.from("personas").getPublicUrl(path);
      added.push({ id: path, url: data.publicUrl });
    }
    if (errored) setUploadError("Certaines images n'ont pas pu être uploadées.");
    // Les nouvelles images n'ont pas encore de position — resolvePersonaImageGrid
    // les place automatiquement à la suite des images déjà positionnées.
    const next = resolvePersonaImageGrid([...toPersonaGridImages(items), ...added]);
    persist(next);
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
                    réservés au survol dès `sm` pour ne pas encombrer une
                    grille dense au clavier/souris. */}
                <div className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover/img:opacity-100">
                  <GripVertical className="h-3 w-3" />
                </div>
                <div className="absolute inset-0 flex items-start justify-end gap-1 p-1 sm:hidden sm:group-hover/img:flex">
                  <button
                    type="button"
                    onClick={() => toggleBg(item.id)}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    aria-label={item.bg ? "Masquer le fond" : "Afficher un fond"}
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
                    aria-label="Supprimer l'image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Redimensionner"
                  onPointerDown={(event) => startResize(event, item)}
                  className="absolute bottom-1 right-1 flex h-5 w-5 touch-none cursor-ew-resize items-center justify-center rounded-full bg-black/60 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover/img:opacity-100"
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
        aria-label="Ajouter des images"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Ajouter des images
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

function makeItemId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function IconButton({
  icon,
  onChangeIcon,
}: {
  icon: string | undefined;
  onChangeIcon: (v: string | undefined) => void;
}) {
  return (
    <RpgIconPicker
      value={icon}
      onChange={onChangeIcon}
      trigger={
        <button
          type="button"
          title={icon ? icon.replace(".svg", "") : "Choisir une icône"}
          className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40 hover:bg-muted transition-colors"
        >
          {icon ? (
            <Image src={`/rpg_icons/${icon}`} alt="" unoptimized width={24} height={24} className="h-6 w-6 object-contain dark:invert" />
          ) : (
            <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
          )}
        </button>
      }
    />
  );
}

function CatalogPicker<T extends WorldInventoryItem | WorldSkill>({
  available,
  label,
  onSelect,
}: {
  available: T[];
  label: string;
  onSelect: (item: T) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={available.length === 0}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="h-3.5 w-3.5" /> {available.length === 0 ? `Tous les ${label}s du catalogue sont ajoutés` : `Ajouter depuis le catalogue`}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Choisir {available.length === 1 ? "un " + label : "un " + label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-80 overflow-y-auto -mx-1 px-1">
            {available.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onSelect(item); setOpen(false); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted transition-colors"
              >
                <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40">
                  {item.icon ? (
                    <Image src={`/rpg_icons/${item.icon}`} alt="" unoptimized width={20} height={20} className="h-5 w-5 object-contain dark:invert" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.name}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InventoryField({
  initialItems,
  onSave,
  catalogItems,
}: {
  initialItems: InventoryItem[];
  onSave: (items: InventoryItem[]) => void;
  catalogItems?: WorldInventoryItem[];
}) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems);

  function update(next: InventoryItem[]) {
    setItems(next);
    onSave(next);
  }

  function patch(id: string, key: keyof InventoryItem, val: string | number | undefined) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }

  function addItem() {
    update([...items, { id: makeItemId(), name: "", quantity: 1, description: "", icon: undefined }]);
  }

  function removeItem(id: string) {
    update(items.filter((it) => it.id !== id));
  }

  // ── Mode restreint (catalogue du monde) ────────────────────────────────────
  if (catalogItems !== undefined) {
    const usedIds = new Set(items.map((i) => i.catalog_id).filter(Boolean));
    const available = catalogItems.filter((c) => !usedIds.has(c.id));

    function addFromCatalog(cat: WorldInventoryItem) {
      update([...items, {
        id: makeItemId(),
        catalog_id: cat.id,
        name: cat.name,
        description: cat.description ?? undefined,
        icon: cat.icon ?? undefined,
        quantity: 1,
      }]);
    }

    return (
      <div className="space-y-2 pr-24">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">
          <Lock className="h-3 w-3" /> Inventaire du catalogue
        </div>
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 group/item">
            <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40">
              {item.icon ? (
                <Image src={`/rpg_icons/${item.icon}`} alt="" unoptimized width={24} height={24} className="h-6 w-6 object-contain dark:invert" />
              ) : (
                <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
              )}
            </div>
            <span className="flex-1 min-w-0 text-sm font-medium truncate">{item.name}</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-muted-foreground">×</span>
              <input
                type="number"
                min={0}
                value={item.quantity}
                onChange={(e) => patch(item.id, "quantity", Number(e.target.value))}
                className="w-12 bg-transparent text-sm text-right outline-none tabular-nums"
              />
            </div>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <CatalogPicker available={available} label="objet" onSelect={addFromCatalog} />
      </div>
    );
  }

  // ── Mode libre ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2 pr-24">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-2 group/item">
          <IconButton icon={item.icon} onChangeIcon={(v) => patch(item.id, "icon", v)} />
          <div className="flex-1 space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <input
                value={item.name}
                onChange={(e) => patch(item.id, "name", e.target.value)}
                placeholder="Nom de l'objet"
                className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40"
              />
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">×</span>
                <input
                  type="number"
                  min={0}
                  value={item.quantity}
                  onChange={(e) => patch(item.id, "quantity", Number(e.target.value))}
                  className="w-12 bg-transparent text-sm text-right outline-none placeholder:text-muted-foreground/40 tabular-nums"
                />
              </div>
            </div>
            <input
              value={item.description ?? ""}
              onChange={(e) => patch(item.id, "description", e.target.value)}
              placeholder="Description (optionnel)"
              className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
            />
          </div>
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="shrink-0 mt-2.5 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:text-destructive transition-opacity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter un objet
      </button>
    </div>
  );
}

function SkillsField({
  initialItems,
  onSave,
  catalogItems,
}: {
  initialItems: SkillItem[];
  onSave: (items: SkillItem[]) => void;
  catalogItems?: WorldSkill[];
}) {
  const [items, setItems] = useState<SkillItem[]>(initialItems);

  function update(next: SkillItem[]) {
    setItems(next);
    onSave(next);
  }

  function patch(id: string, key: keyof SkillItem, val: string | undefined) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }

  function addItem() {
    update([...items, { id: makeItemId(), name: "", level: "", description: "", icon: undefined }]);
  }

  function removeItem(id: string) {
    update(items.filter((it) => it.id !== id));
  }

  // ── Mode restreint (catalogue du monde) ────────────────────────────────────
  if (catalogItems !== undefined) {
    const usedIds = new Set(items.map((i) => i.catalog_id).filter(Boolean));
    const available = catalogItems.filter((c) => !usedIds.has(c.id));

    function addFromCatalog(cat: WorldSkill) {
      update([...items, {
        id: makeItemId(),
        catalog_id: cat.id,
        name: cat.name,
        description: cat.description ?? undefined,
        icon: cat.icon ?? undefined,
        level: "",
      }]);
    }

    return (
      <div className="space-y-2 pr-24">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">
          <Lock className="h-3 w-3" /> Compétences du catalogue
        </div>
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 group/skill">
            <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-border-soft bg-muted/40">
              {item.icon ? (
                <Image src={`/rpg_icons/${item.icon}`} alt="" unoptimized width={24} height={24} className="h-6 w-6 object-contain dark:invert" />
              ) : (
                <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
              )}
            </div>
            <span className="flex-1 min-w-0 text-sm font-medium truncate">{item.name}</span>
            <input
              value={item.level}
              onChange={(e) => patch(item.id, "level", e.target.value)}
              placeholder="Niveau"
              className="w-20 shrink-0 bg-transparent text-xs text-right text-muted-foreground outline-none placeholder:text-muted-foreground/40"
            />
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/skill:opacity-100 hover:text-destructive transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <CatalogPicker available={available} label="compétence" onSelect={addFromCatalog} />
      </div>
    );
  }

  // ── Mode libre ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2 pr-24">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-2 group/skill">
          <IconButton icon={item.icon} onChangeIcon={(v) => patch(item.id, "icon", v)} />
          <div className="flex-1 space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <input
                value={item.name}
                onChange={(e) => patch(item.id, "name", e.target.value)}
                placeholder="Nom de la compétence"
                className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40"
              />
              <input
                value={item.level}
                onChange={(e) => patch(item.id, "level", e.target.value)}
                placeholder="Niveau"
                className="w-20 shrink-0 bg-transparent text-xs text-right text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              />
            </div>
            <input
              value={item.description ?? ""}
              onChange={(e) => patch(item.id, "description", e.target.value)}
              placeholder="Description (optionnel)"
              className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
            />
          </div>
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="shrink-0 mt-2.5 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/skill:opacity-100 hover:text-destructive transition-opacity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter une compétence
      </button>
    </div>
  );
}

function GaugesField({
  initialItems,
  onSave,
}: {
  initialItems: GaugeItem[];
  onSave: (items: GaugeItem[]) => void;
}) {
  const [items, setItems] = useState<GaugeItem[]>(initialItems);

  function update(next: GaugeItem[]) { setItems(next); onSave(next); }
  function patch(id: string, key: keyof GaugeItem, val: string | number) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }
  function addItem() {
    update([...items, { id: makeItemId(), name: "", value: 0, max: 100, color: "#6366f1" }]);
  }
  function removeItem(id: string) { update(items.filter((it) => it.id !== id)); }

  return (
    <div className="space-y-3 pr-24">
      {items.map((item) => {
        const pct = Math.min(100, ((item.value ?? 0) / (item.max || 1)) * 100);
        return (
          <div key={item.id} className="group/gauge space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                value={item.name}
                onChange={(e) => patch(item.id, "name", e.target.value)}
                placeholder="Nom de la jauge"
                className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40"
              />
              <div className="flex items-center gap-1.5 shrink-0 text-sm tabular-nums text-muted-foreground">
                <input
                  type="number"
                  min={0}
                  value={item.value}
                  onChange={(e) => patch(item.id, "value", Number(e.target.value))}
                  className="w-12 bg-transparent text-right outline-none"
                />
                <span>/</span>
                <input
                  type="number"
                  min={1}
                  value={item.max}
                  onChange={(e) => patch(item.id, "max", Math.max(1, Number(e.target.value)))}
                  className="w-12 bg-transparent outline-none"
                />
                <input
                  type="color"
                  value={item.color}
                  onChange={(e) => patch(item.id, "color", e.target.value)}
                  className="h-6 w-6 shrink-0 cursor-pointer rounded border-none bg-transparent p-0"
                  title="Couleur"
                />
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/gauge:opacity-100 hover:text-destructive transition-opacity"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: item.color }}
              />
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter une jauge
      </button>
    </div>
  );
}

function QuoteField({
  initialText,
  initialSource,
  onSave,
}: {
  initialText: string;
  initialSource: string;
  onSave: (text: string, source: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const [source, setSource] = useState(initialSource);

  return (
    <div className="space-y-2 pr-24">
      <ParagraphBlockEditor
        value={text}
        onChange={(v) => { setText(v); onSave(v, source); }}
        submitOnEnter={false}
        placeholder="Citation…"
        className="text-sm italic leading-relaxed font-mono"
      />
      <input
        value={source}
        onChange={(e) => { setSource(e.target.value); onSave(text, e.target.value); }}
        placeholder="— Source (optionnel)"
        className="w-full bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40"
      />
    </div>
  );
}

function TraitsField({
  initialItems,
  onSave,
}: {
  initialItems: TraitItem[];
  onSave: (items: TraitItem[]) => void;
}) {
  const [items, setItems] = useState<TraitItem[]>(initialItems);

  function update(next: TraitItem[]) { setItems(next); onSave(next); }
  function patchLabel(id: string, label: string) {
    update(items.map((it) => (it.id === id ? { ...it, label } : it)));
  }
  function removeItem(id: string) { update(items.filter((it) => it.id !== id)); }
  function addItem() { update([...items, { id: makeItemId(), label: "" }]); }

  return (
    <div className="flex flex-wrap gap-2 pr-24">
      {items.map((item) => (
        <div
          key={item.id}
          className="group/trait flex items-center gap-1 rounded-full border border-border-soft bg-muted/40 px-2.5 py-1"
        >
          <input
            value={item.label}
            onChange={(e) => patchLabel(item.id, e.target.value)}
            placeholder="Trait…"
            size={Math.max(4, item.label.length + 1)}
            className="bg-transparent text-xs font-medium outline-none placeholder:text-muted-foreground/40 min-w-[4rem]"
          />
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="shrink-0 text-muted-foreground opacity-0 group-hover/trait:opacity-100 hover:text-destructive transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1 rounded-full border border-dashed border-border-soft px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="h-3 w-3" /> Trait
      </button>
    </div>
  );
}

function TimelineField({
  initialItems,
  onSave,
}: {
  initialItems: TimelineItem[];
  onSave: (items: TimelineItem[]) => void;
}) {
  const [items, setItems] = useState<TimelineItem[]>(initialItems);

  function update(next: TimelineItem[]) { setItems(next); onSave(next); }
  function patch(id: string, key: keyof TimelineItem, val: string) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }
  function addItem() {
    update([...items, { id: makeItemId(), date: "", title: "", description: "" }]);
  }
  function removeItem(id: string) { update(items.filter((it) => it.id !== id)); }

  return (
    <div className="space-y-0 pr-24">
      {items.map((item, i) => (
        <div key={item.id} className="flex gap-3 group/event">
          <div className="flex flex-col items-center">
            <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-border" />
            {i < items.length - 1 && <div className="flex-1 w-px bg-border mt-1" />}
          </div>
          <div className="flex-1 space-y-1 pb-4 min-w-0">
            <div className="flex items-center gap-2">
              <input
                value={item.date ?? ""}
                onChange={(e) => patch(item.id, "date", e.target.value)}
                placeholder="Époque…"
                className="w-24 shrink-0 bg-transparent text-[0.65rem] text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              />
              <input
                value={item.title}
                onChange={(e) => patch(item.id, "title", e.target.value)}
                placeholder="Titre de l'événement"
                className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/event:opacity-100 hover:text-destructive transition-opacity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              value={item.description ?? ""}
              onChange={(e) => patch(item.id, "description", e.target.value)}
              placeholder="Description (optionnel)"
              rows={2}
              className="w-full bg-transparent text-xs text-muted-foreground outline-none resize-none placeholder:text-muted-foreground/40 leading-relaxed"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter un événement
      </button>
    </div>
  );
}

function DlField({
  initialItems,
  onSave,
}: {
  initialItems: DlItem[];
  onSave: (items: DlItem[]) => void;
}) {
  const [items, setItems] = useState<DlItem[]>(initialItems);

  function update(next: DlItem[]) { setItems(next); onSave(next); }
  function patch(id: string, key: keyof DlItem, val: string) {
    update(items.map((it) => (it.id === id ? { ...it, [key]: val } : it)));
  }
  function addItem() { update([...items, { id: makeItemId(), label: "", description: "" }]); }
  function removeItem(id: string) { update(items.filter((it) => it.id !== id)); }

  return (
    <div className="space-y-2 pr-24">
      <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2">
        {items.map((item) => (
          <div key={item.id} className="group/dl contents">
            <input
              value={item.label}
              onChange={(e) => patch(item.id, "label", e.target.value)}
              placeholder="Titre"
              className="min-w-[3rem] self-start bg-transparent text-sm font-semibold text-left outline-none placeholder:text-muted-foreground/40"
            />
            <div className="flex items-start gap-2">
              <input
                value={item.description}
                onChange={(e) => patch(item.id, "description", e.target.value)}
                placeholder="Description"
                className="flex-1 min-w-0 bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover/dl:opacity-100 hover:text-destructive transition-opacity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter une entrée
      </button>
    </div>
  );
}

type SectionFieldsEditorProps = {
  sectionId: string;
  personaId: string;
  userId: string | null;
  initialFields: PersonaSectionField[];
  /** Remonte l'état courant des champs au parent (source de vérité locale). */
  onFieldsChange?: (fields: PersonaSectionField[]) => void;
  worldId?: string;
  restrictInventory?: boolean;
  restrictSkills?: boolean;
  /** Édition de la fiche modèle d'un monde : permet de verrouiller des champs. */
  isTemplate?: boolean;
};

export function SectionFieldsEditor({ sectionId, personaId, userId, initialFields, onFieldsChange, worldId, restrictInventory, restrictSkills, isTemplate }: SectionFieldsEditorProps) {
  const supabase = createClient();
  const flags = useFeatureFlags();
  const fieldsEnabled = flags.persona_fields;
  const persona_field_title = fieldsEnabled && flags.persona_field_title;
  const persona_field_text = fieldsEnabled && flags.persona_field_text;
  const persona_field_stats = fieldsEnabled && flags.persona_field_stats;
  const persona_field_separator = fieldsEnabled && flags.persona_field_separator;
  const persona_field_image_grid = fieldsEnabled && flags.persona_field_image_grid;
  const persona_field_inventory = fieldsEnabled && flags.persona_field_inventory;
  const persona_field_skills = fieldsEnabled && flags.persona_field_skills;
  const persona_field_gauges = fieldsEnabled && flags.persona_field_gauges;
  const persona_field_quote = fieldsEnabled && flags.persona_field_quote;
  const persona_field_traits = fieldsEnabled && flags.persona_field_traits;
  const persona_field_timeline = fieldsEnabled && flags.persona_field_timeline;
  const persona_field_dl = fieldsEnabled && flags.persona_field_dl;
  const [fields, setFields] = useState<PersonaSectionField[]>(initialFields);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inventoryCatalog, setInventoryCatalog] = useState<WorldInventoryItem[] | undefined>(undefined);
  const [skillsCatalog, setSkillsCatalog] = useState<WorldSkill[] | undefined>(undefined);

  useEffect(() => {
    if (!worldId) return;
    async function fetchCatalog() {
      if (restrictInventory) {
        const { data } = await (supabase as ReturnType<typeof createClient>)
          .from("world_inventory_items")
          .select("id, world_id, name, description, icon, sort_index")
          .eq("world_id", worldId!)
          .order("sort_index", { ascending: true })
          .order("created_at", { ascending: true });
        setInventoryCatalog((data as WorldInventoryItem[] | null) ?? []);
      }
      if (restrictSkills) {
        const { data } = await (supabase as ReturnType<typeof createClient>)
          .from("world_skills")
          .select("id, world_id, name, description, icon, sort_index")
          .eq("world_id", worldId!)
          .order("sort_index", { ascending: true })
          .order("created_at", { ascending: true });
        setSkillsCatalog((data as WorldSkill[] | null) ?? []);
      }
    }
    void fetchCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, restrictInventory, restrictSkills]);

  // Synchronise l'état local vers le parent à chaque changement (sauf au montage
  // initial, où les données sont déjà identiques à celles du parent).
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    onFieldsChange?.(fields);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);



  function computeWithPositions(list: PersonaSectionField[]) {
    return list.map((f, idx) => ({ ...f, position: idx * 10 }));
  }

  async function persistPositions(list: PersonaSectionField[]) {
    const results = await Promise.all(
      list.map((f) =>
        supabase.from("persona_section_fields").update({ position: f.position }).eq("id", f.id),
      ),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) setErrorMessage(err.message ?? "Erreur positions.");
  }

  async function handleAddField(type: PersonaFieldType, insertAt: number) {
    setErrorMessage(null);

    const defaultData: Record<string, unknown> =
      type === "title"
        ? { text: "" }
        : type === "stats"
          ? { items: [] }
          : type === "separator"
            ? {}
            : type === "image-grid"
              ? { images: [] }
              : type === "inventory"
                ? { inventoryItems: [] }
                : type === "skills"
                  ? { skillItems: [] }
                  : type === "gauges"
                    ? { gaugeItems: [] }
                    : type === "quote"
                      ? { quoteText: "", quoteSource: "" }
                      : type === "traits"
                        ? { traitItems: [] }
                        : type === "timeline"
                          ? { timelineItems: [] }
                          : type === "dl"
                            ? { dlItems: [] }
                            : { text: "", format: "markdown" };

    const { data, error } = await supabase
      .from("persona_section_fields")
      .insert({ section_id: sectionId, type, data: defaultData })
      .select("id, section_id, type, position, data, locked")
      .single();

    if (error) {
      setErrorMessage(error.message ?? "Erreur ajout.");
      return;
    }

    const current = [...fields];
    current.splice(insertAt, 0, data as PersonaSectionField);
    const withPos = computeWithPositions(current);
    setFields(withPos);
    await persistPositions(withPos);
  }


  // Sauvegarde inline (blur) pour les champs input/textarea
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveFieldValue = useCallback(
    async (fieldId: string, key: "value" | "text", newValue: string) => {
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId ? { ...f, data: { ...f.data, [key]: newValue } } : f,
        ),
      );
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const field = fields.find((f) => f.id === fieldId);
        if (!field) return;
        const newData = { ...field.data, [key]: newValue };
        const { error } = await supabase
          .from("persona_section_fields")
          .update({ data: newData })
          .eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields],
  );

  const saveImageGrid = useCallback(
    async (fieldId: string, images: PersonaGridImage[]) => {
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId ? { ...f, data: { ...f.data, images } } : f,
        ),
      );
      const { error } = await supabase
        .from("persona_section_fields")
        .update({ data: { images } })
        .eq("id", fieldId);
      if (error) setErrorMessage(error.message ?? "Erreur sauvegarde images.");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const saveStatsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveFieldItems = useCallback(
    (fieldId: string, items: PersonaStat[]) => {
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId ? { ...f, data: { ...f.data, items } } : f,
        ),
      );
      if (saveStatsTimer.current) clearTimeout(saveStatsTimer.current);
      saveStatsTimer.current = setTimeout(async () => {
        const field = fields.find((f) => f.id === fieldId);
        const newData = { ...(field?.data ?? {}), items };
        const { error } = await supabase
          .from("persona_section_fields")
          .update({ data: newData })
          .eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields],
  );

  const inventoryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveInventoryItems = useCallback(
    (fieldId: string, inventoryItems: InventoryItem[]) => {
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId ? { ...f, data: { ...f.data, inventoryItems } } : f,
        ),
      );
      if (inventoryTimer.current) clearTimeout(inventoryTimer.current);
      inventoryTimer.current = setTimeout(async () => {
        const { error } = await supabase
          .from("persona_section_fields")
          .update({ data: { inventoryItems } })
          .eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde inventaire.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const skillsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveSkillItems = useCallback(
    (fieldId: string, skillItems: SkillItem[]) => {
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId ? { ...f, data: { ...f.data, skillItems } } : f,
        ),
      );
      if (skillsTimer.current) clearTimeout(skillsTimer.current);
      skillsTimer.current = setTimeout(async () => {
        const { error } = await supabase
          .from("persona_section_fields")
          .update({ data: { skillItems } })
          .eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde compétences.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const gaugesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGaugeItems = useCallback(
    (fieldId: string, gaugeItems: GaugeItem[]) => {
      setFields((prev) =>
        prev.map((f) => f.id === fieldId ? { ...f, data: { ...f.data, gaugeItems } } : f),
      );
      if (gaugesTimer.current) clearTimeout(gaugesTimer.current);
      gaugesTimer.current = setTimeout(async () => {
        const { error } = await supabase.from("persona_section_fields").update({ data: { gaugeItems } }).eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde jauges.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQuote = useCallback(
    (fieldId: string, quoteText: string, quoteSource: string) => {
      setFields((prev) =>
        prev.map((f) => f.id === fieldId ? { ...f, data: { ...f.data, quoteText, quoteSource } } : f),
      );
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
      quoteTimer.current = setTimeout(async () => {
        const { error } = await supabase.from("persona_section_fields").update({ data: { quoteText, quoteSource } }).eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde citation.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const traitsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTraitItems = useCallback(
    (fieldId: string, traitItems: TraitItem[]) => {
      setFields((prev) =>
        prev.map((f) => f.id === fieldId ? { ...f, data: { ...f.data, traitItems } } : f),
      );
      if (traitsTimer.current) clearTimeout(traitsTimer.current);
      traitsTimer.current = setTimeout(async () => {
        const { error } = await supabase.from("persona_section_fields").update({ data: { traitItems } }).eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde traits.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const timelineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimelineItems = useCallback(
    (fieldId: string, timelineItems: TimelineItem[]) => {
      setFields((prev) =>
        prev.map((f) => f.id === fieldId ? { ...f, data: { ...f.data, timelineItems } } : f),
      );
      if (timelineTimer.current) clearTimeout(timelineTimer.current);
      timelineTimer.current = setTimeout(async () => {
        const { error } = await supabase.from("persona_section_fields").update({ data: { timelineItems } }).eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde timeline.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const dlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDlItems = useCallback(
    (fieldId: string, dlItems: DlItem[]) => {
      setFields((prev) =>
        prev.map((f) => f.id === fieldId ? { ...f, data: { ...f.data, dlItems } } : f),
      );
      if (dlTimer.current) clearTimeout(dlTimer.current);
      dlTimer.current = setTimeout(async () => {
        const { error } = await supabase.from("persona_section_fields").update({ data: { dlItems } }).eq("id", fieldId);
        if (error) setErrorMessage(error.message ?? "Erreur sauvegarde liste.");
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function handleMoveField(fieldId: string, direction: "up" | "down") {
    const index = fields.findIndex((f) => f.id === fieldId);
    if (index === -1) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    const withPos = computeWithPositions(next);
    setFields(withPos);
    await persistPositions(withPos);
  }

  // Verrouille/déverrouille un champ de la fiche modèle (le trigger DB
  // n'autorise ce changement que sur un persona modèle).
  async function toggleFieldLock(field: PersonaSectionField) {
    const next = !field.locked;
    const { error } = await supabase
      .from("persona_section_fields")
      .update({ locked: next })
      .eq("id", field.id);
    if (error) { setErrorMessage(error.message ?? "Erreur de verrouillage."); return; }
    setFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, locked: next } : f)));
  }

  async function handleDeleteField(fieldId: string) {
    const field = fields.find((f) => f.id === fieldId);
    if (field?.type === "image-grid") {
      // Lire depuis la DB pour avoir les chemins à jour (état local peut être désynchronisé)
      const { data: dbField } = await supabase
        .from("persona_section_fields")
        .select("data")
        .eq("id", fieldId)
        .single();
      const paths = ((dbField?.data?.images ?? []) as PersonaGridImage[])
        .map((img) => img.id)
        .filter(Boolean);
      if (paths.length) await supabase.storage.from("personas").remove(paths);
    }
    const { error } = await supabase.from("persona_section_fields").delete().eq("id", fieldId);
    if (error) { setErrorMessage(error.message ?? "Erreur suppression."); return; }
    const next = computeWithPositions(fields.filter((f) => f.id !== fieldId));
    setFields(next);
  }


  function AddFieldMenu({ insertAt, trigger }: { insertAt: number; trigger?: ReactNode }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <div className="cursor-pointer transition-opacity opacity-0 hover:opacity-100 group-hover/field:opacity-100 relative h-6 w-full flex justify-center before:absolute before:h-px before:w-full before:top-1/2 before:-translate-y-1/2 before:bg-border">
              <button className="w-4 h-4 bg-accent/50 text-primary rounded-full inline-flex items-center justify-center absolute top-1/2 -translate-y-1/2 z-10">
                <Plus size={12} />
              </button>
            </div>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-48">
          {persona_field_title && (
            <DropdownMenuItem onClick={() => handleAddField("title", insertAt)}>
              <Type className="mr-2 h-4 w-4" /> Titre
            </DropdownMenuItem>
          )}
          {persona_field_text && (
            <DropdownMenuItem onClick={() => handleAddField("text", insertAt)}>
              <AlignLeft className="mr-2 h-4 w-4" /> Bloc de texte
            </DropdownMenuItem>
          )}
          {persona_field_dl && (
            <DropdownMenuItem onClick={() => handleAddField("dl", insertAt)}>
              <List className="mr-2 h-4 w-4" /> Liste descriptive
            </DropdownMenuItem>
          )}
          {persona_field_quote && (
            <DropdownMenuItem onClick={() => handleAddField("quote", insertAt)}>
              <Quote className="mr-2 h-4 w-4" /> Citation
            </DropdownMenuItem>
          )}
          {(persona_field_stats || persona_field_gauges || persona_field_inventory || persona_field_skills) && <DropdownMenuSeparator />}
          {persona_field_stats && (
            <DropdownMenuItem onClick={() => handleAddField("stats", insertAt)}>
              <BarChart3 className="mr-2 h-4 w-4" /> Stats
            </DropdownMenuItem>
          )}
          {persona_field_gauges && (
            <DropdownMenuItem onClick={() => handleAddField("gauges", insertAt)}>
              <Gauge className="mr-2 h-4 w-4" /> Jauges
            </DropdownMenuItem>
          )}
          {persona_field_inventory && (
            <DropdownMenuItem onClick={() => handleAddField("inventory", insertAt)}>
              <Backpack className="mr-2 h-4 w-4" /> Inventaire
            </DropdownMenuItem>
          )}
          {persona_field_skills && (
            <DropdownMenuItem onClick={() => handleAddField("skills", insertAt)}>
              <Swords className="mr-2 h-4 w-4" /> Compétences
            </DropdownMenuItem>
          )}
          {(persona_field_traits || persona_field_timeline) && <DropdownMenuSeparator />}
          {persona_field_traits && (
            <DropdownMenuItem onClick={() => handleAddField("traits", insertAt)}>
              <Tag className="mr-2 h-4 w-4" /> Traits
            </DropdownMenuItem>
          )}
          {persona_field_timeline && (
            <DropdownMenuItem onClick={() => handleAddField("timeline", insertAt)}>
              <CalendarDays className="mr-2 h-4 w-4" /> Timeline
            </DropdownMenuItem>
          )}
          {(persona_field_separator || persona_field_image_grid) && <DropdownMenuSeparator />}
          {persona_field_separator && (
            <DropdownMenuItem onClick={() => handleAddField("separator", insertAt)}>
              <Minus className="mr-2 h-4 w-4" /> Séparateur
            </DropdownMenuItem>
          )}
          {persona_field_image_grid && (
            <DropdownMenuItem onClick={() => handleAddField("image-grid", insertAt)}>
              <ImageIcon className="mr-2 h-4 w-4" /> Grille d&apos;images
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-1">
      {errorMessage && <p className="text-xs text-red-500 mb-2">{errorMessage}</p>}

      {fields.length === 0 ? (
        <div className="py-4 space-y-3">
          <p className="text-sm text-muted-foreground">Aucun champ. Ajoutes-en un pour commencer.</p>
          <AddFieldMenu
            insertAt={0}
            trigger={
              <Button variant="outline" size="sm" type="button" className="w-full">
                <Plus className="mr-2 h-4 w-4" /> Ajouter un champ
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-0">
          <AddFieldMenu insertAt={0} />

          {fields.map((field, index) => {
            const isFirst = index === 0;
            const isLast = index === fields.length - 1;

            return (
              <div key={field.id} className="group/field">
                <div className="group relative rounded-md border border-transparent py-1.5 px-2 hover:border-border-soft transition-colors">
                  {/* Badge permanent : champ requis par la fiche du monde */}
                  {!isTemplate && field.locked && (
                    <span
                      className="absolute right-2.5 top-2 text-muted-foreground/50 group-hover:opacity-0 transition-opacity z-10"
                      title="Champ requis par la fiche du monde"
                    >
                      <Lock className="h-3.5 w-3.5" />
                    </span>
                  )}

                  {/* Actions flottantes */}
                  <div className="absolute right-1.5 top-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Button variant="ghost" size="icon-sm" type="button" className="h-7 w-7" onClick={() => handleMoveField(field.id, "up")} disabled={isFirst}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" type="button" className="h-7 w-7" onClick={() => handleMoveField(field.id, "down")} disabled={isLast}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    {isTemplate && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        className={cn("h-7 w-7", field.locked ? "text-primary" : "text-muted-foreground")}
                        title={field.locked
                          ? "Champ verrouillé (requis sur les fiches des joueurs) — cliquer pour déverrouiller"
                          : "Verrouiller ce champ : il sera requis sur les fiches des joueurs"}
                        onClick={() => void toggleFieldLock(field)}
                      >
                        {field.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    {!isTemplate && field.locked ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        disabled
                        className="h-7 w-7 text-muted-foreground"
                        title="Champ requis par la fiche du monde — impossible à supprimer"
                      >
                        <Lock className="h-3.5 w-3.5" />
                      </Button>
                    ) : field.type === "image-grid" ? (
                      <DeleteConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon-sm" type="button" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                        description="Ce champ et toutes ses images hébergées seront supprimés définitivement."
                        onConfirm={() => handleDeleteField(field.id)}
                      />
                    ) : (
                      <Button variant="ghost" size="icon-sm" type="button" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteField(field.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Rendu du champ */}
                  {field.type === "title" && (
                    <input
                      defaultValue={field.data?.text ?? ""}
                      placeholder="Titre…"
                      onBlur={(e) => saveFieldValue(field.id, "text", e.target.value)}
                      className="w-full bg-transparent text-base font-semibold pr-24 outline-none placeholder:text-muted-foreground/40 focus:ring-0 border-none"
                    />
                  )}

                  {field.type === "text" && (
                    <MarkdownTextField
                      initialText={field.data?.text ?? ""}
                      onSave={(val) => saveFieldValue(field.id, "text", val)}
                    />
                  )}

                  {field.type === "stats" && (
                    <div className="pr-24">
                      <StatsField
                        initialItems={field.data?.items ?? []}
                        onSave={(items) => saveFieldItems(field.id, items)}
                      />
                    </div>
                  )}

                  {field.type === "separator" && (
                    <div className="flex h-6 items-center pr-24">
                      <div className="h-px w-full bg-border" />
                    </div>
                  )}

                  {field.type === "image-grid" && (
                    <ImageGridField
                      fieldId={field.id}
                      initialImages={field.data?.images ?? []}
                      personaId={personaId}
                      userId={userId}
                      onSave={(images) => saveImageGrid(field.id, images)}
                    />
                  )}

                  {field.type === "inventory" && (
                    <InventoryField
                      initialItems={field.data?.inventoryItems ?? []}
                      onSave={(items) => saveInventoryItems(field.id, items)}
                      catalogItems={inventoryCatalog}
                    />
                  )}

                  {field.type === "skills" && (
                    <SkillsField
                      initialItems={field.data?.skillItems ?? []}
                      onSave={(items) => saveSkillItems(field.id, items)}
                      catalogItems={skillsCatalog}
                    />
                  )}

                  {field.type === "gauges" && (
                    <GaugesField
                      initialItems={field.data?.gaugeItems ?? []}
                      onSave={(items) => saveGaugeItems(field.id, items)}
                    />
                  )}

                  {field.type === "quote" && (
                    <QuoteField
                      initialText={field.data?.quoteText ?? ""}
                      initialSource={field.data?.quoteSource ?? ""}
                      onSave={(text, source) => saveQuote(field.id, text, source)}
                    />
                  )}

                  {field.type === "traits" && (
                    <TraitsField
                      initialItems={field.data?.traitItems ?? []}
                      onSave={(items) => saveTraitItems(field.id, items)}
                    />
                  )}

                  {field.type === "timeline" && (
                    <TimelineField
                      initialItems={field.data?.timelineItems ?? []}
                      onSave={(items) => saveTimelineItems(field.id, items)}
                    />
                  )}

                  {field.type === "dl" && (
                    <DlField
                      initialItems={field.data?.dlItems ?? []}
                      onSave={(items) => saveDlItems(field.id, items)}
                    />
                  )}

                </div>

                <AddFieldMenu insertAt={index + 1} />
              </div>
            );
          })}
        </div>
      )}


    </div>
  );
}
