import { isSafeUrl } from "@/lib/utils";
import type { PersonaGridImage } from "@/types/personas";

/**
 * Grille 2D pour la section "image-grid" d'un profil de persona — même
 * principe que la grille de blocs de la page d'accueil d'un monde
 * (components/worlds/home/worldHomeGrid.ts, dont ce module reprend le
 * moteur : lignes de blocs qui se partagent la largeur, redimensionnement
 * en tandem avec le voisin, pas de collision possible par construction).
 * Pas importé tel quel : les types y sont couplés aux blocs de home
 * (widget/html/markdown/banner) — ce module ne connaît que des images.
 *
 * Une image n'a pas de hauteur réglable : chaque ligne s'auto-dimensionne à
 * son contenu (voir ImageGridView.tsx), seule la largeur se règle en
 * glissant le bord d'une image (voir ImageGridField dans
 * SectionFieldsEditor.tsx).
 */
export type PersonaImageGridItem = {
  id: string;
  url: string;
  caption?: string;
  x: number;
  y: number;
  w: number;
  /** Fond affiché derrière l'image (utile en `object-contain` quand elle ne
   *  remplit pas toute sa case) — activé par défaut. */
  bg: boolean;
};

/** Panneau du profil ~460px de large — moins de colonnes que les 12 de la
 *  grille de page d'accueil, qui occupe toute la largeur d'une page. */
export const IMAGE_GRID_COLS = 6;
/** Largeur minimale d'une image, en colonnes. */
export const MIN_IMAGE_W = 2;
export const MAX_IMAGES_PER_ROW = Math.floor(IMAGE_GRID_COLS / MIN_IMAGE_W);
/** Hauteur d'une ligne dans l'éditeur, en pixels — une tuile photo, pas une
 *  barre de titre (contrairement à HOME_GRID_ROW_HEIGHT) : les images
 *  peuvent avoir des largeurs différentes sur une même ligne, donc pas
 *  toutes carrées — `object-cover` les remplit sans déformation. */
export const IMAGE_GRID_ROW_HEIGHT = 110;
/** Longueur maximale d'une légende d'image. */
export const MAX_IMAGE_CAPTION_LENGTH = 200;
/** Borne haute de `y`, généreuse au-delà d'un nombre raisonnable d'images. */
const MAX_IMAGE_GRID_Y = 500;

function isFiniteInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Place séquentiellement des images sans position connue (upload tout
 *  juste ajouté), deux par ligne, à partir de la ligne `startY`. */
function synthesizeRows(
  images: { id: string; url: string; caption?: string; bg: boolean }[],
  startY: number,
): PersonaImageGridItem[] {
  const perRow = 2;
  const w = Math.floor(IMAGE_GRID_COLS / perRow);
  return images.map((img, i) => ({
    ...img,
    x: (i % perRow) * w,
    y: startY + Math.floor(i / perRow),
    w,
  }));
}

/**
 * Résout la liste brute stockée en JSON (`persona_section_fields.data.images`)
 * vers une grille valide. Chaque image valide déjà positionnée (x/y/w) est
 * conservée telle quelle ; une image sans position (ajout par upload, qui ne
 * connaît pas encore sa place, voir ImageGridField) est placée
 * automatiquement à la suite des autres. Filtre plutôt que de planter sur une
 * donnée corrompue.
 */
export function resolvePersonaImageGrid(raw: unknown): PersonaImageGridItem[] {
  if (!Array.isArray(raw)) return [];

  const seenIds = new Set<string>();
  const placed: PersonaImageGridItem[] = [];
  const unplaced: { id: string; url: string; caption?: string; bg: boolean }[] = [];

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id || seenIds.has(r.id)) continue;
    if (typeof r.url !== "string" || !isSafeUrl(r.url)) continue;
    seenIds.add(r.id);

    const caption =
      typeof r.caption === "string" && r.caption.trim()
        ? r.caption.trim().slice(0, MAX_IMAGE_CAPTION_LENGTH)
        : undefined;
    const bg = r.bg !== false;
    const image = { id: r.id, url: r.url, ...(caption ? { caption } : {}), bg };

    if (
      isFiniteInt(r.x) && isFiniteInt(r.y) && isFiniteInt(r.w) &&
      r.x >= 0 && r.y >= 0 && r.y <= MAX_IMAGE_GRID_Y && r.w >= MIN_IMAGE_W
    ) {
      const w = Math.min(r.w, IMAGE_GRID_COLS - r.x);
      if (w >= MIN_IMAGE_W) {
        placed.push({ ...image, x: r.x, y: r.y, w });
        continue;
      }
    }
    unplaced.push(image);
  }

  const maxY = placed.reduce((m, it) => Math.max(m, it.y), -1);
  return compactImageGridRows([...placed, ...synthesizeRows(unplaced, maxY + 1)]);
}

/** Convertit la grille résolue vers la forme stockée (`PersonaGridImage[]`). */
export function toPersonaGridImages(items: PersonaImageGridItem[]): PersonaGridImage[] {
  return items.map(({ id, url, caption, x, y, w, bg }) => ({
    id,
    url,
    caption,
    x,
    y,
    w,
    ...(bg ? {} : { bg: false }),
  }));
}

/** Renumérote les lignes en séquence, comble les trous laissés par une image
 *  supprimée — même logique que compactHomeGridRows. */
export function compactImageGridRows(items: PersonaImageGridItem[]): PersonaImageGridItem[] {
  const usedRows = [...new Set(items.map((i) => i.y))].sort((a, b) => a - b);
  const rowByOldY = new Map(usedRows.map((y, index) => [y, index]));
  return items.map((item) => {
    const y = rowByOldY.get(item.y) ?? item.y;
    return y === item.y ? item : { ...item, y };
  });
}

/** Regroupe les images par ligne, chaque ligne triée de gauche à droite. */
export function toRows(items: PersonaImageGridItem[]): PersonaImageGridItem[][] {
  const byRow = new Map<number, PersonaImageGridItem[]>();
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = byRow.get(item.y);
    if (row) row.push(item);
    else byRow.set(item.y, [item]);
  }
  return [...byRow.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}

/** Inverse de `toRows` : renumérote les lignes et recalcule `x` en enchaînant
 *  les largeurs. Les lignes vides disparaissent. */
export function fromRows(rows: PersonaImageGridItem[][]): PersonaImageGridItem[] {
  return rows
    .filter((row) => row.length > 0)
    .flatMap((row, y) => {
      let x = 0;
      return row.map((item) => {
        const placed = { ...item, x, y };
        x += item.w;
        return placed;
      });
    });
}

/** Répartit la largeur de la grille à parts égales entre les images d'une
 *  ligne (le reste allant aux premières) — appliqué aux lignes dont la
 *  composition change lors d'un déplacement. */
export function distributeRow(row: PersonaImageGridItem[]): PersonaImageGridItem[] {
  if (row.length === 0) return row;
  const base = Math.floor(IMAGE_GRID_COLS / row.length);
  const extra = IMAGE_GRID_COLS - base * row.length;
  let x = 0;
  return row.map((item, index) => {
    const w = base + (index < extra ? 1 : 0);
    const placed = { ...item, x, w };
    x += w;
    return placed;
  });
}

function findRightNeighbor(items: PersonaImageGridItem[], item: PersonaImageGridItem): PersonaImageGridItem | null {
  return items.find((other) => other.id !== item.id && other.y === item.y && other.x === item.x + item.w) ?? null;
}

function findLeftNeighbor(items: PersonaImageGridItem[], item: PersonaImageGridItem): PersonaImageGridItem | null {
  return items.find((other) => other.id !== item.id && other.y === item.y && other.x + other.w === item.x) ?? null;
}

/** Frontières internes de la grille (couples d'images voisines sur une même
 *  ligne) — un diviseur de redimensionnement par frontière dans l'éditeur. */
export function rowBoundaries(
  items: PersonaImageGridItem[],
): { left: PersonaImageGridItem; right: PersonaImageGridItem }[] {
  return toRows(items).flatMap((row) =>
    row.slice(1).map((right, index) => ({ left: row[index], right })),
  );
}

/**
 * Déplace la frontière d'une image de `deltaCols` colonnes, en tandem avec
 * sa voisine (largeur totale de la paire préservée) — fonction pure, comme
 * resizeBlock dans worldHomeGrid.ts.
 */
export function resizeImage(
  items: PersonaImageGridItem[],
  id: string,
  edge: "w" | "e",
  deltaCols: number,
): PersonaImageGridItem[] {
  const item = items.find((i) => i.id === id);
  if (!item) return items;

  if (edge === "e") {
    const neighbor = findRightNeighbor(items, item);
    if (!neighbor) {
      const w = clamp(item.w + deltaCols, MIN_IMAGE_W, IMAGE_GRID_COLS - item.x);
      return items.map((i) => (i.id === id ? { ...i, w } : i));
    }
    const total = item.w + neighbor.w;
    const w = clamp(item.w + deltaCols, MIN_IMAGE_W, total - MIN_IMAGE_W);
    return items.map((i) => {
      if (i.id === id) return { ...i, w };
      if (i.id === neighbor.id) return { ...i, x: item.x + w, w: total - w };
      return i;
    });
  }

  const rightEdge = item.x + item.w;
  const neighbor = findLeftNeighbor(items, item);
  const minX = neighbor ? neighbor.x + MIN_IMAGE_W : 0;
  const x = clamp(item.x + deltaCols, minX, rightEdge - MIN_IMAGE_W);
  return items.map((i) => {
    if (i.id === id) return { ...i, x, w: rightEdge - x };
    if (neighbor && i.id === neighbor.id) return { ...i, w: x - neighbor.x };
    return i;
  });
}

/**
 * Déplace une image vers la ligne `targetRow`, insérée à hauteur de la
 * colonne `targetCol` — même logique que moveBlock dans worldHomeGrid.ts.
 */
export function moveImage(
  items: PersonaImageGridItem[],
  id: string,
  targetRow: number,
  targetCol: number,
  asNewRow = false,
): PersonaImageGridItem[] {
  const moved = items.find((i) => i.id === id);
  if (!moved) return items;

  const rows = toRows(items);
  const sourceRow = rows.findIndex((row) => row.some((i) => i.id === id));
  const remaining = rows.map((row) => row.filter((i) => i.id !== id));

  if (asNewRow) {
    const at = clamp(targetRow, 0, remaining.length);
    const next = [...remaining];
    next.splice(at, 0, [moved]);
    const shiftedSource = sourceRow >= at ? sourceRow + 1 : sourceRow;
    return fromRows(
      next.map((row, i) => (i === at || i === shiftedSource ? distributeRow(row) : row)),
    );
  }

  const clampedRow = clamp(targetRow, 0, remaining.length);
  const destination = remaining[clampedRow] ?? [];
  const isNewRow = clampedRow >= remaining.length;

  // L'image est seule sur la ligne visée (typiquement : elle revient sur sa
  // propre ligne, désormais vide une fois elle-même retirée) — un simple
  // repositionnement horizontal, largeur inchangée, plutôt qu'un
  // réarrangement multi-images qui la redimensionnerait via distributeRow
  // (elle deviendrait pleine largeur même pour un léger décalage). Permet
  // aussi de la centrer sur sa ligne en la faisant glisser.
  if (!isNewRow && destination.length === 0) {
    const x = clamp(Math.round(targetCol), 0, IMAGE_GRID_COLS - moved.w);
    return items.map((i) => (i.id === id ? { ...i, y: clampedRow, x } : i));
  }

  if (!isNewRow && destination.length >= MAX_IMAGES_PER_ROW && sourceRow !== clampedRow) return items;

  let index = destination.findIndex((b) => targetCol < b.x + b.w / 2);
  if (index < 0) index = destination.length;

  const next = [...remaining];
  if (isNewRow) next.push([moved]);
  else next[clampedRow] = [...destination.slice(0, index), moved, ...destination.slice(index)];

  return fromRows(
    next.map((row, i) => (i === sourceRow || i === clampedRow ? distributeRow(row) : row)),
  );
}
