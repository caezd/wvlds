/**
 * Registre des widgets réordonnables de la page d'accueil d'un monde (hors
 * bannière hero, toujours fixe en tête). Un admin choisit lesquels sont
 * actifs et dans quel ordre via `worlds.home_layout` — même liste pour tous
 * les visiteurs du monde.
 */
export type WorldHomeWidgetId =
  | "categories"
  | "composer"
  | "chatrooms"
  | "stats"
  | "members_online"
  | "announcement";

export const ALL_WORLD_HOME_WIDGETS: WorldHomeWidgetId[] = [
  "categories",
  "composer",
  "chatrooms",
  "stats",
  "members_online",
  "announcement",
];

/** Ordre affiché avant que l'admin n'ait jamais personnalisé la page. */
export const DEFAULT_WORLD_HOME_LAYOUT: WorldHomeWidgetId[] = [
  "categories",
  "composer",
  "chatrooms",
];

/** Limite de taille du HTML/CSS libre du widget « Annonce » — partagée entre
 *  l'éditeur (validation immédiate) et l'action serveur (source de vérité). */
export const MAX_ANNOUNCEMENT_HTML_LENGTH = 20_000;

function isWorldHomeWidgetId(value: unknown): value is WorldHomeWidgetId {
  return typeof value === "string" && (ALL_WORLD_HOME_WIDGETS as string[]).includes(value);
}

/**
 * Résout la valeur brute stockée en base vers une liste d'ids valides.
 * `null`/vide/tout-invalide retombe sur l'ordre par défaut ; les entrées
 * inconnues (widget supprimé depuis) sont filtrées silencieusement.
 */
export function resolveWorldHomeLayout(raw: unknown): WorldHomeWidgetId[] {
  if (!Array.isArray(raw)) return DEFAULT_WORLD_HOME_LAYOUT;
  const seen = new Set<WorldHomeWidgetId>();
  const filtered = raw.filter((id): id is WorldHomeWidgetId => {
    if (!isWorldHomeWidgetId(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return filtered.length > 0 ? filtered : DEFAULT_WORLD_HOME_LAYOUT;
}
