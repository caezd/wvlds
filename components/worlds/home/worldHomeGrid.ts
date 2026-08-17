import {
  ALL_WORLD_HOME_WIDGETS,
  resolveWorldHomeLayout,
  type WorldHomeWidgetId,
} from "./worldHomeWidgets";

/**
 * Grille 2D de blocs de la page d'accueil d'un monde (hors bannière hero,
 * toujours fixe en tête) — remplace l'ancien système à colonne unique
 * (`worlds.home_layout`, voir `worldHomeWidgets.ts`) par une grille où
 * chaque bloc a une position (x, y) et une largeur (w, en colonnes),
 * librement déplaçable/redimensionnable par un admin.
 *
 * Pas de hauteur réglable (`h`) : chaque bloc occupe une seule ligne dont la
 * hauteur réelle s'ajuste automatiquement à son contenu (CSS `grid-auto-rows:
 * min-content`, voir WorldHomeGridView.tsx) — un contenu plus long qu'un
 * autre sur la même ligne ne peut donc jamais la faire déborder sur les
 * blocs suivants, sans avoir besoin d'un `overflow` de secours. Seule la
 * largeur reste au choix de l'admin, en glissant le bord droit d'un bloc
 * (voir le diviseur de WorldHomeGridEditor.tsx).
 */
export type WorldHomeBlockType = "widget" | "html" | "markdown";

export type WorldHomeGridItem = {
  id: string;
  type: WorldHomeBlockType;
  x: number;
  y: number;
  w: number;
  /** type === "widget" */
  widgetId?: WorldHomeWidgetId;
  /** type === "html" — HTML/CSS libre, rendu dans une iframe sandboxée (pas de JS). */
  html?: string;
  /** type === "markdown" */
  content?: string;
  /** Titre libre d'un bloc html/markdown — sert à l'identifier dans l'éditeur
   *  (à défaut : « Bloc HTML »/« Bloc Markdown »). Purement descriptif, non
   *  affiché sur la page d'accueil. */
  title?: string;
  /** Réglages propres au widget (voir WORLD_HOME_WIDGET_OPTIONS). */
  options?: Record<string, number>;
};

/** Longueur maximale du titre d'un bloc html/markdown. */
export const MAX_HOME_BLOCK_TITLE_LENGTH = 80;

/** Définition d'un réglage numérique de widget — pilote à la fois le champ
 *  affiché dans l'éditeur et la validation (client et serveur), pour qu'un
 *  nouveau réglage n'ait à être déclaré qu'à un seul endroit. */
export type WorldHomeWidgetOption = {
  key: string;
  min: number;
  max: number;
  default: number;
};

/**
 * Réglages disponibles par widget. Un widget absent de ce registre n'a
 * aucune option (pas d'icône de réglages dans l'éditeur).
 *
 * `visibleRows` (salons) borne la hauteur d'affichage de la liste : au-delà,
 * le reste défile à l'intérieur du bloc — c'est un réglage d'affichage, il ne
 * change pas ce qui est chargé. `limit` (raccourcis wiki, personas récents,
 * membres en ligne) borne au contraire le nombre d'entrées récupérées.
 */
export const WORLD_HOME_WIDGET_OPTIONS: Partial<Record<WorldHomeWidgetId, WorldHomeWidgetOption[]>> = {
  chatrooms: [{ key: "visibleRows", min: 1, max: 50, default: 8 }],
  wiki_shortcuts: [{ key: "limit", min: 1, max: 20, default: 6 }],
  personas_recent: [{ key: "limit", min: 1, max: 30, default: 10 }],
  members_online: [{ key: "limit", min: 1, max: 20, default: 8 }],
};

/** Valeur d'un réglage, bornée au registre, avec repli sur la valeur par défaut. */
export function widgetOptionValue(
  widgetId: WorldHomeWidgetId | undefined,
  key: string,
  options: Record<string, number> | undefined,
): number {
  const def = (widgetId && WORLD_HOME_WIDGET_OPTIONS[widgetId])?.find((o) => o.key === key);
  if (!def) return 0;
  const raw = options?.[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return def.default;
  return Math.min(def.max, Math.max(def.min, Math.round(raw)));
}

/**
 * Ne garde que les réglages déclarés pour ce widget, bornés au registre —
 * une clé inconnue (réglage retiré depuis) ou une valeur hors bornes est
 * écartée plutôt que propagée. Retourne `undefined` si rien ne reste, pour
 * ne pas stocker d'objet vide.
 */
export function sanitizeWidgetOptions(
  widgetId: WorldHomeWidgetId | undefined,
  raw: unknown,
): Record<string, number> | undefined {
  const defs = widgetId ? WORLD_HOME_WIDGET_OPTIONS[widgetId] : undefined;
  if (!defs || typeof raw !== "object" || raw === null) return undefined;
  const source = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const def of defs) {
    const value = source[def.key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out[def.key] = Math.min(def.max, Math.max(def.min, Math.round(value)));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export const HOME_GRID_COLS = 12;
/** Hauteur d'une ligne dans l'éditeur (react-grid-layout a besoin d'une unité
 *  fixe pour ses calculs de glisser-déposer) — purement indicative : le rendu
 *  public (WorldHomeGridView) ignore cette constante et s'auto-dimensionne au
 *  contenu réel de chaque ligne. Calée sur la hauteur d'une barre de titre,
 *  seul contenu d'un bloc dans l'éditeur. */
export const HOME_GRID_ROW_HEIGHT = 36;
/** Limite de taille du contenu HTML/Markdown libre d'un bloc — partagée
 *  entre les éditeurs de bloc (validation immédiate) et l'action serveur
 *  (source de vérité). Anciennement `MAX_ANNOUNCEMENT_HTML_LENGTH`. */
export const MAX_HOME_BLOCK_CONTENT_LENGTH = 20_000;
/** Nombre maximal de blocs dans la grille d'un monde. */
export const MAX_HOME_GRID_ITEMS = 24;
/** Borne haute de `y` — chaque bloc occupant une seule ligne, ce nombre est
 *  aussi le nombre maximal de lignes distinctes (généreux au-delà de
 *  MAX_HOME_GRID_ITEMS pour laisser des lignes partiellement occupées). */
export const MAX_HOME_GRID_Y = MAX_HOME_GRID_ITEMS * 2;

function isFiniteInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function isWorldHomeWidgetId(value: unknown): value is WorldHomeWidgetId {
  return typeof value === "string" && (ALL_WORLD_HOME_WIDGETS as string[]).includes(value);
}

/**
 * Valide/assainit un item brut issu de la base — filtre plutôt que de
 * planter sur une donnée corrompue ou obsolète (widget retiré depuis,
 * coordonnées hors bornes...). `seenIds`/`seenWidgetIds` sont mutés pour
 * dédupliquer au fil de la liste.
 */
function sanitizeGridItem(
  raw: unknown,
  seenIds: Set<string>,
  seenWidgetIds: Set<WorldHomeWidgetId>,
): WorldHomeGridItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== "string" || !r.id || seenIds.has(r.id)) return null;
  if (r.type !== "widget" && r.type !== "html" && r.type !== "markdown") return null;
  if (!isFiniteInt(r.x) || !isFiniteInt(r.y) || !isFiniteInt(r.w)) return null;
  if (r.x < 0 || r.y < 0 || r.y > MAX_HOME_GRID_Y || r.w < 2) return null;

  const x = r.x;
  const y = r.y;
  // Clampe plutôt que rejette un bloc qui déborderait légèrement la grille
  // (ex: donnée écrite par une version antérieure avec des bornes différentes).
  const w = Math.min(r.w, HOME_GRID_COLS - x);
  if (w < 2) return null;

  if (r.type === "widget") {
    if (!isWorldHomeWidgetId(r.widgetId) || r.widgetId === "announcement") return null;
    if (seenWidgetIds.has(r.widgetId)) return null;
    if (r.html !== undefined || r.content !== undefined) return null;
    seenWidgetIds.add(r.widgetId);
    seenIds.add(r.id);
    const options = sanitizeWidgetOptions(r.widgetId, r.options);
    return { id: r.id, type: "widget", x, y, w, widgetId: r.widgetId, ...(options ? { options } : {}) };
  }

  const title =
    typeof r.title === "string" && r.title.trim()
      ? { title: r.title.trim().slice(0, MAX_HOME_BLOCK_TITLE_LENGTH) }
      : {};

  if (r.type === "html") {
    if (typeof r.html !== "string" || r.widgetId !== undefined || r.content !== undefined) return null;
    seenIds.add(r.id);
    return { id: r.id, type: "html", x, y, w, html: r.html, ...title };
  }

  // markdown
  if (typeof r.content !== "string" || r.widgetId !== undefined || r.html !== undefined) return null;
  seenIds.add(r.id);
  return { id: r.id, type: "markdown", x, y, w, content: r.content, ...title };
}

/**
 * Synthétise une grille à partir de l'ancien système (`home_layout` +
 * l'ancienne annonce) — calculée à la volée, jamais réécrite en base : un
 * visiteur sans droit d'écriture ne doit jamais déclencher de sauvegarde,
 * et côté admin ce serait un effet de bord non déterministe au premier
 * chargement. Ne persiste que lorsqu'un admin enregistre explicitement
 * depuis le nouvel éditeur.
 *
 * `resolveWorldHomeLayout` retombe déjà sur `DEFAULT_WORLD_HOME_LAYOUT`
 * pour une valeur non-tableau (monde jamais personnalisé) — cette fonction
 * sert donc aussi de grille par défaut sans logique séparée, et préserve
 * `[]` explicite (désactivation volontaire de tous les widgets) tel quel.
 * Un bloc par ligne (`y` séquentiel) : plus de hauteur à deviner pour
 * l'ancienne annonce ou les anciens widgets, chaque ligne s'auto-dimensionne
 * au rendu.
 */
function synthesizeLegacyGrid(
  legacyLayout: unknown,
  legacyAnnouncementHtml: unknown,
): WorldHomeGridItem[] {
  const ids = resolveWorldHomeLayout(legacyLayout);
  if (ids.length === 0) return [];

  const html = typeof legacyAnnouncementHtml === "string" ? legacyAnnouncementHtml : "";

  const items: WorldHomeGridItem[] = [];
  let y = 0;
  for (const id of ids) {
    if (id === "announcement") {
      // Repli positionnel : l'annonce redevient un bloc html à sa place
      // d'origine dans la pile, pas ajoutée en fin de liste.
      if (!html.trim()) continue;
      items.push({ id: "announcement", type: "html", x: 0, y, w: HOME_GRID_COLS, html });
      y += 1;
      continue;
    }
    items.push({ id, type: "widget", x: 0, y, w: HOME_GRID_COLS, widgetId: id });
    y += 1;
  }
  return items;
}

/**
 * Renumérote les lignes en séquence (0, 1, 2…) en préservant leur ordre et
 * les blocs qui partagent une même ligne. Retirer un bloc laisse sinon sa
 * ligne d'origine vide : les blocs suivants gardent leur ancien `y` et le
 * rendu affiche un trou (une ligne fantôme) à la place. Appliqué à la
 * lecture comme à l'écriture, donc une grille déjà trouée en base se répare
 * d'elle-même au prochain affichage.
 */
export function compactHomeGridRows(items: WorldHomeGridItem[]): WorldHomeGridItem[] {
  const usedRows = [...new Set(items.map((i) => i.y))].sort((a, b) => a - b);
  const rowByOldY = new Map(usedRows.map((y, index) => [y, index]));
  return items.map((item) => {
    const y = rowByOldY.get(item.y) ?? item.y;
    return y === item.y ? item : { ...item, y };
  });
}

/**
 * Résout la valeur brute stockée en base (`worlds.home_grid`) vers une
 * liste de blocs valides. `home_grid` non défini retombe sur une synthèse
 * de l'ancien système (`home_layout` + annonce) ou, à défaut, sur la
 * grille par défaut ; `home_grid === []` est une désactivation explicite de
 * tous les blocs et reste vide.
 */
export function resolveWorldHomeGrid(
  rawGrid: unknown,
  legacyLayout: unknown,
  legacyAnnouncementHtml: unknown,
): WorldHomeGridItem[] {
  if (Array.isArray(rawGrid)) {
    if (rawGrid.length === 0) return [];
    const seenIds = new Set<string>();
    const seenWidgetIds = new Set<WorldHomeWidgetId>();
    const sanitized = rawGrid
      .slice(0, MAX_HOME_GRID_ITEMS)
      .map((item) => sanitizeGridItem(item, seenIds, seenWidgetIds))
      .filter((item): item is WorldHomeGridItem => item !== null);
    if (sanitized.length > 0) return compactHomeGridRows(sanitized);
  }

  return synthesizeLegacyGrid(legacyLayout, legacyAnnouncementHtml);
}

/**
 * Trouve le bloc immédiatement à droite d'un autre sur la même ligne (bord
 * gauche de l'un collé au bord droit de l'autre) — la frontière partagée
 * que le glisser du bord droit de `item` doit redimensionner en tandem
 * (voir WorldHomeGridEditor.tsx). `null` si `item` touche déjà le bord
 * droit de la grille ou si rien ne le borde directement.
 */
export function findRightNeighbor(items: WorldHomeGridItem[], item: WorldHomeGridItem): WorldHomeGridItem | null {
  return items.find((other) => other.id !== item.id && other.y === item.y && other.x === item.x + item.w) ?? null;
}
