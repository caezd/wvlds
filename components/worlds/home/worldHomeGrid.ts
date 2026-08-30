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
 * Chaque bloc occupe une seule ligne, dont la hauteur s'ajuste par défaut à
 * son contenu (CSS `grid-auto-rows: min-content`, voir WorldHomeGridView.tsx)
 * — un contenu plus long qu'un autre sur la même ligne ne peut donc jamais la
 * faire déborder sur les blocs suivants.
 *
 * Seuls les blocs à contenu libre (`html`, `markdown`) acceptent une hauteur
 * explicite (`h`, en pixels) : leur contenu n'est pas produit par
 * l'application, elle ne peut donc pas lui trouver une bonne hauteur toute
 * seule. Le cas du HTML est le plus net — rendu dans une iframe, il retombe
 * sinon sur la hauteur intrinsèque de celle-ci (150 px), quel que soit son
 * contenu. Les widgets, eux, gardent leur hauteur automatique : leur contenu
 * vient de l'application, qui sait le dimensionner (voir les options
 * `visibleRows`/`limit` de WORLD_HOME_WIDGET_OPTIONS pour en borner la
 * quantité).
 *
 * La largeur reste au choix de l'admin en glissant le bord droit d'un bloc
 * (voir le diviseur de WorldHomeGridEditor.tsx).
 */
export type WorldHomeBlockType = "widget" | "html" | "markdown" | "banner";

export type WorldHomeBannerAlign = "left" | "center";

/** Contenu d'un bloc bannière — structuré plutôt que du HTML/Markdown libre,
 *  inspiré des blocs « encadré » (callout) des chatrooms : image de fond,
 *  titre, texte court et bouton d'action optionnels. */
export type WorldHomeBannerContent = {
  title?: string;
  text?: string;
  /** Image de fond, hébergée dans le bucket `worlds` (voir WorldHomeGridEditor). */
  image?: string;
  /** Couleur d'accent (bouton) — sans valeur, le bouton reprend la couleur
   *  primaire du thème. */
  accent?: string;
  /** Absent = "left", valeur implicite (voir sanitizeBannerContent). */
  align?: WorldHomeBannerAlign;
  /** Le bouton n'est rendu que si le libellé ET l'URL sont tous les deux
   *  présents — voir sanitizeBannerContent. */
  buttonLabel?: string;
  buttonUrl?: string;
};

export type WorldHomeGridItem = {
  id: string;
  type: WorldHomeBlockType;
  x: number;
  y: number;
  w: number;
  /** type === "widget" */
  widgetId?: WorldHomeWidgetId;
  /** type === "html" — balisage libre, assaini par liste blanche et rendu
   *  dans la page (voir blocks/homeHtmlBlock.ts). */
  html?: string;
  /** type === "html" — feuille de style du bloc, cloisonnée à son sous-arbre
   *  par `@scope` au rendu. Séparée du balisage depuis que celui-ci est
   *  assaini : une balise `<style>` au milieu du HTML n'y survivrait pas.
   *  Les blocs antérieurs à ce champ gardent la leur dans `html` — elle est
   *  hissée au rendu, cf. prepareHomeHtmlBlock. */
  css?: string;
  /** type === "markdown" */
  content?: string;
  /** type === "html" | "markdown" — carte (bordure + fond) ou plein largeur
   *  sans bordure. Toujours résolu en booléen explicite par
   *  sanitizeGridItem/validateHomeGridItem (jamais laissé `undefined`), pour
   *  que le rendu n'ait pas à connaître de valeur par défaut par type. */
  card?: boolean;
  /** type === "banner" */
  banner?: WorldHomeBannerContent;
  /** type === "html" | "markdown" — hauteur fixe du bloc, en pixels. Absent =
   *  hauteur automatique : le markdown suit son contenu, l'iframe d'un bloc
   *  html retombe sur ses 150 px intrinsèques. Un contenu plus long que la
   *  hauteur fixée défile à l'intérieur du bloc (cf. WorldHomeGridView). */
  h?: number;
  /** Titre libre d'un bloc html/markdown — sert à l'identifier dans l'éditeur
   *  (à défaut : « Bloc HTML »/« Bloc Markdown »). Purement descriptif, non
   *  affiché sur la page d'accueil. */
  title?: string;
  /** Réglages propres au widget (voir WORLD_HOME_WIDGET_OPTIONS). */
  options?: Record<string, number>;
};

/** Longueur maximale du titre d'un bloc html/markdown, et du titre/libellé de
 *  bouton d'un bloc bannière. */
export const MAX_HOME_BLOCK_TITLE_LENGTH = 80;
/** Longueur maximale du texte court d'un bloc bannière — un sous-titre, pas
 *  un pavé de texte (voir MAX_HOME_BLOCK_CONTENT_LENGTH pour html/markdown). */
export const MAX_HOME_BANNER_TEXT_LENGTH = 400;
/** Longueur maximale d'une URL de bannière (image de fond ou bouton). */
export const MAX_HOME_BANNER_URL_LENGTH = 2000;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

/** N'accepte qu'une URL absolue http(s) ou un chemin relatif au site — même
 *  restriction que les liens rendus par CalloutMarkdown (components/chatrooms/blocks/CalloutBlock.tsx). */
function sanitizeBannerUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().slice(0, MAX_HOME_BANNER_URL_LENGTH);
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/") ? trimmed : undefined;
}

/**
 * Valide/assainit le contenu d'un bloc bannière — partagée par la validation
 * client (sanitizeGridItem) et serveur (validateHomeGridItem dans
 * app/actions/worldCatalog.ts), comme sanitizeWidgetOptions pour les widgets.
 * `null` si le bloc n'a ni titre, ni texte, ni image (rien à afficher) — le
 * bouton, lui, n'est jamais requis à lui seul.
 */
export function sanitizeBannerContent(raw: unknown): WorldHomeBannerContent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const title =
    typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, MAX_HOME_BLOCK_TITLE_LENGTH) : undefined;
  const text =
    typeof r.text === "string" && r.text.trim() ? r.text.trim().slice(0, MAX_HOME_BANNER_TEXT_LENGTH) : undefined;
  const image = sanitizeBannerUrl(r.image);
  const accent = typeof r.accent === "string" && HEX_COLOR_RE.test(r.accent.trim()) ? r.accent.trim() : undefined;
  const align = r.align === "center" ? ("center" as const) : undefined;
  const buttonLabel =
    typeof r.buttonLabel === "string" && r.buttonLabel.trim()
      ? r.buttonLabel.trim().slice(0, MAX_HOME_BLOCK_TITLE_LENGTH)
      : undefined;
  const buttonUrl = sanitizeBannerUrl(r.buttonUrl);
  const hasButton = !!buttonLabel && !!buttonUrl;

  if (!title && !text && !image) return null;

  return {
    ...(title ? { title } : {}),
    ...(text ? { text } : {}),
    ...(image ? { image } : {}),
    ...(accent ? { accent } : {}),
    ...(align ? { align } : {}),
    ...(hasButton ? { buttonLabel, buttonUrl } : {}),
  };
}

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
  timeline_shortcuts: [{ key: "limit", min: 1, max: 20, default: 6 }],
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
/** Hauteur d'une ligne dans l'éditeur, en pixels — purement indicative : le
 *  rendu public (WorldHomeGridView) l'ignore et s'auto-dimensionne au contenu
 *  réel de chaque ligne. Calée sur la hauteur d'une barre de titre, seul
 *  contenu d'un bloc dans l'éditeur. */
export const HOME_GRID_ROW_HEIGHT = 36;
/**
 * Gouttière entre blocs — un des trois préréglages ci-dessous, choisi par
 * l'admin (Réglages > Page d'accueil) et partagé par le rendu public
 * (WorldHomeGridView) ET l'éditeur (WorldHomeGridEditor, qui s'en sert aussi
 * pour convertir des pixels de curseur en colonnes de grille pendant un
 * geste). Avant l'introduction de ce réglage, les deux vues utilisaient des
 * valeurs codées en dur différentes (12px côté public, 8px côté éditeur) —
 * l'éditeur ne montrait donc pas fidèlement le rendu final.
 */
export type WorldHomeGridGap = "compact" | "comfortable" | "spacious";

export const HOME_GRID_GAP_PRESETS: Record<WorldHomeGridGap, number> = {
  compact: 8,
  comfortable: 12,
  spacious: 20,
};

/** Valeur par défaut pour un monde qui n'a jamais réglé ce paramètre —
 *  reprend le 12px qu'affichait déjà tout visiteur avant ce réglage. */
export const DEFAULT_HOME_GRID_GAP: WorldHomeGridGap = "comfortable";

/** Résout la valeur brute stockée en base (`worlds.home_grid_gap`) vers un
 *  préréglage valide — une valeur inconnue (jamais réglé, ou préréglage
 *  retiré depuis) retombe sur `DEFAULT_HOME_GRID_GAP` plutôt que d'échouer. */
export function resolveHomeGridGap(raw: unknown): WorldHomeGridGap {
  return typeof raw === "string" && raw in HOME_GRID_GAP_PRESETS
    ? (raw as WorldHomeGridGap)
    : DEFAULT_HOME_GRID_GAP;
}
/** Largeur minimale d'un bloc, en colonnes — miroir de la validation serveur
 *  (`w < 2` rejeté, voir setWorldHomeGrid). */
export const MIN_BLOCK_W = 2;
/** Une ligne ne peut pas contenir plus de blocs que sa largeur ne permet, en
 *  respectant la largeur minimale de chacun. */
export const MAX_BLOCKS_PER_ROW = Math.floor(HOME_GRID_COLS / MIN_BLOCK_W);
/** Longueur maximale de la feuille de style d'un bloc html — même budget que
 *  son balisage (voir MAX_HOME_BLOCK_CONTENT_LENGTH juste en dessous). */
export const MAX_HOME_BLOCK_CSS_LENGTH = 20_000;
/** Limite de taille du contenu HTML/Markdown libre d'un bloc — partagée
 *  entre les éditeurs de bloc (validation immédiate) et l'action serveur
 *  (source de vérité). Anciennement `MAX_ANNOUNCEMENT_HTML_LENGTH`. */
export const MAX_HOME_BLOCK_CONTENT_LENGTH = 20_000;
/**
 * Bornes de la hauteur explicite d'un bloc html/markdown, en pixels —
 * partagées par le champ de l'éditeur (bornes du champ), l'assainissement
 * client (sanitizeGridItem) et la validation serveur (validateHomeGridItem),
 * pour qu'elles ne soient déclarées qu'à un seul endroit.
 */
export const MIN_HOME_BLOCK_HEIGHT = 80;
export const MAX_HOME_BLOCK_HEIGHT = 2000;

/**
 * Résout une hauteur brute vers une valeur stockable, ou `undefined` pour
 * « automatique ».
 *
 * Une valeur non numérique, ou nulle/négative, vaut « automatique » : c'est
 * ce que produit un champ vidé par l'admin. Une valeur positive mais hors
 * bornes est en revanche ramenée dans les bornes plutôt qu'écartée — l'admin
 * a exprimé une intention de taille, la trahir en repassant en automatique
 * serait plus surprenant que la borner (même parti-pris que
 * `sanitizeWidgetOptions`).
 */
export function sanitizeBlockHeight(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const rounded = Math.round(raw);
  if (rounded < 1) return undefined;
  return Math.min(MAX_HOME_BLOCK_HEIGHT, Math.max(MIN_HOME_BLOCK_HEIGHT, rounded));
}

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
  if (r.type !== "widget" && r.type !== "html" && r.type !== "markdown" && r.type !== "banner") return null;
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

  if (r.type === "banner") {
    if (r.widgetId !== undefined || r.html !== undefined || r.content !== undefined) return null;
    const banner = sanitizeBannerContent(r.banner);
    if (!banner) return null;
    seenIds.add(r.id);
    return { id: r.id, type: "banner", x, y, w, banner };
  }

  const title =
    typeof r.title === "string" && r.title.trim()
      ? { title: r.title.trim().slice(0, MAX_HOME_BLOCK_TITLE_LENGTH) }
      : {};

  if (r.type === "html") {
    if (typeof r.html !== "string" || r.widgetId !== undefined || r.content !== undefined) return null;
    seenIds.add(r.id);
    const css = typeof r.css === "string" && r.css.trim() ? { css: r.css } : {};
    // Défaut "carte" (bordure + fond) : préserve l'apparence d'avant
    // l'introduction de ce réglage, où un bloc html était toujours ainsi.
    const card = r.card !== false;
    const h = sanitizeBlockHeight(r.h);
    return { id: r.id, type: "html", x, y, w, html: r.html, card, ...css, ...(h ? { h } : {}), ...title };
  }

  // markdown
  if (typeof r.content !== "string" || r.widgetId !== undefined || r.html !== undefined) return null;
  seenIds.add(r.id);
  // Défaut "plein largeur" : préserve l'apparence d'avant ce réglage, où un
  // bloc markdown n'avait jamais de carte.
  const card = r.card === true;
  const h = sanitizeBlockHeight(r.h);
  return { id: r.id, type: "markdown", x, y, w, content: r.content, card, ...(h ? { h } : {}), ...title };
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
      items.push({ id: "announcement", type: "html", x: 0, y, w: HOME_GRID_COLS, html, card: true });
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

/**
 * Symétrique de `findRightNeighbor` : le bloc dont le bord DROIT touche le
 * bord gauche de `item`, sur la même ligne — la frontière que le glisser du
 * bord gauche de `item` redimensionne en tandem. `null` si `item` commence
 * déjà au bord gauche de la grille ou si rien ne le borde directement.
 */
export function findLeftNeighbor(items: WorldHomeGridItem[], item: WorldHomeGridItem): WorldHomeGridItem | null {
  return items.find((other) => other.id !== item.id && other.y === item.y && other.x + other.w === item.x) ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Frontières internes de la grille : chaque couple de blocs voisins sur une
 * même ligne. C'est exactement l'ensemble des gouttières situées ENTRE deux
 * colonnes — l'éditeur y place un diviseur, seul point de saisie pour régler
 * la largeur (voir WorldHomeGridEditor.tsx). Les bords extérieurs d'une ligne
 * n'en font pas partie : une ligne occupe toujours toute la largeur, il n'y a
 * rien à y étirer.
 */
export function rowBoundaries(
  items: WorldHomeGridItem[],
): { left: WorldHomeGridItem; right: WorldHomeGridItem }[] {
  return toRows(items).flatMap((row) =>
    row.slice(1).map((right, index) => ({ left: row[index], right })),
  );
}

/** Regroupe les blocs par ligne, chaque ligne triée de gauche à droite. */
export function toRows(items: WorldHomeGridItem[]): WorldHomeGridItem[][] {
  const byRow = new Map<number, WorldHomeGridItem[]>();
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = byRow.get(item.y);
    if (row) row.push(item);
    else byRow.set(item.y, [item]);
  }
  return [...byRow.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}

/**
 * Inverse de `toRows` : renumérote les lignes en séquence et recalcule le `x`
 * de chaque bloc en enchaînant les largeurs. Les lignes vides disparaissent.
 */
export function fromRows(rows: WorldHomeGridItem[][]): WorldHomeGridItem[] {
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

/**
 * Répartit la largeur de la grille à parts égales entre les blocs d'une ligne
 * (le reste de la division allant aux premiers). Appliqué aux seules lignes
 * dont la composition change lors d'un déplacement : une ligne qui perd un
 * bloc doit combler le trou, une ligne qui en gagne un doit faire de la
 * place. Les autres lignes gardent les largeurs réglées à la main.
 */
export function distributeRow(row: WorldHomeGridItem[]): WorldHomeGridItem[] {
  if (row.length === 0) return row;
  const base = Math.floor(HOME_GRID_COLS / row.length);
  const extra = HOME_GRID_COLS - base * row.length;
  let x = 0;
  return row.map((item, index) => {
    const w = base + (index < extra ? 1 : 0);
    const placed = { ...item, x, w };
    x += w;
    return placed;
  });
}

/**
 * Déplace la frontière d'un bloc de `deltaCols` colonnes, en tandem avec son
 * voisin : la paire garde sa largeur totale et sa ligne, seule la séparation
 * bouge. Sans voisin de ce côté, le bloc s'étend jusqu'au bord de la grille.
 * Bornée pour qu'aucun des deux ne passe sous `MIN_BLOCK_W`.
 *
 * Fonction pure : c'est ici que vit toute l'arithmétique du redimensionnement,
 * pas dans les gestionnaires d'événements — elle est ainsi testable seule,
 * sans simuler de geste de souris.
 */
export function resizeBlock(
  items: WorldHomeGridItem[],
  id: string,
  edge: "w" | "e",
  deltaCols: number,
): WorldHomeGridItem[] {
  const item = items.find((i) => i.id === id);
  if (!item) return items;

  if (edge === "e") {
    const neighbor = findRightNeighbor(items, item);
    if (!neighbor) {
      const w = clamp(item.w + deltaCols, MIN_BLOCK_W, HOME_GRID_COLS - item.x);
      return items.map((i) => (i.id === id ? { ...i, w } : i));
    }
    const total = item.w + neighbor.w;
    const w = clamp(item.w + deltaCols, MIN_BLOCK_W, total - MIN_BLOCK_W);
    return items.map((i) => {
      if (i.id === id) return { ...i, w };
      if (i.id === neighbor.id) return { ...i, x: item.x + w, w: total - w };
      return i;
    });
  }

  // Bord gauche : le bord DROIT du bloc reste fixe, c'est `x` qui bouge.
  const rightEdge = item.x + item.w;
  const neighbor = findLeftNeighbor(items, item);
  const minX = neighbor ? neighbor.x + MIN_BLOCK_W : 0;
  const x = clamp(item.x + deltaCols, minX, rightEdge - MIN_BLOCK_W);
  return items.map((i) => {
    if (i.id === id) return { ...i, x, w: rightEdge - x };
    if (neighbor && i.id === neighbor.id) return { ...i, w: x - neighbor.x };
    return i;
  });
}

/**
 * Déplace un bloc vers la ligne `targetRow`, inséré à hauteur de la colonne
 * `targetCol` (le bloc se place avant le premier bloc dont il dépasse le
 * milieu). `targetRow` au-delà de la dernière ligne crée une nouvelle ligne.
 *
 * Aucune notion de collision : un bloc appartient à une ligne, une ligne est
 * une suite ordonnée de blocs qui se partagent les 12 colonnes. Insérer ou
 * retirer ne peut donc jamais produire de chevauchement — seules les deux
 * lignes touchées sont redistribuées, les autres gardent leurs largeurs.
 */
export function moveBlock(
  items: WorldHomeGridItem[],
  id: string,
  targetRow: number,
  targetCol: number,
  asNewRow = false,
): WorldHomeGridItem[] {
  const moved = items.find((i) => i.id === id);
  if (!moved) return items;

  const rows = toRows(items);
  const sourceRow = rows.findIndex((row) => row.some((i) => i.id === id));
  const remaining = rows.map((row) => row.filter((i) => i.id !== id));

  // Déposer ENTRE deux lignes plutôt que SUR l'une d'elles : le bloc s'insère
  // seul, sur sa propre ligne, au lieu de venir se partager la largeur de la
  // ligne visée. Sans cette distinction, une ligne à deux colonnes absorbait
  // tout bloc qu'on essayait de faire passer au-dessus d'elle.
  if (asNewRow) {
    const at = clamp(targetRow, 0, remaining.length);
    const next = [...remaining];
    next.splice(at, 0, [moved]);
    // L'insertion décale d'un cran l'index de la ligne d'origine si celle-ci
    // se trouve après le point d'insertion.
    const shiftedSource = sourceRow >= at ? sourceRow + 1 : sourceRow;
    // La ligne créée est redistribuée elle aussi : seule sur sa ligne, le
    // bloc doit en prendre toute la largeur plutôt que de conserver celle
    // qu'il avait quand il partageait sa ligne précédente.
    return fromRows(
      next.map((row, i) => (i === at || i === shiftedSource ? distributeRow(row) : row)),
    );
  }

  const clampedRow = clamp(targetRow, 0, remaining.length);
  const destination = remaining[clampedRow] ?? [];

  // Une ligne pleine (largeur minimale partout) ne peut pas en accueillir un
  // de plus : le geste est ignoré plutôt que d'écraser un bloc existant.
  const isNewRow = clampedRow >= remaining.length;
  if (!isNewRow && destination.length >= MAX_BLOCKS_PER_ROW && sourceRow !== clampedRow) return items;

  let index = destination.findIndex((b) => targetCol < b.x + b.w / 2);
  if (index < 0) index = destination.length;

  const next = [...remaining];
  if (isNewRow) next.push([moved]);
  else next[clampedRow] = [...destination.slice(0, index), moved, ...destination.slice(index)];

  // Seules la ligne d'origine (qui a un trou à combler) et la ligne d'arrivée
  // (qui doit faire de la place) sont redistribuées.
  return fromRows(
    next.map((row, i) => (i === sourceRow || i === clampedRow ? distributeRow(row) : row)),
  );
}
