/**
 * Registre des widgets plaçables dans la grille de la page d'accueil d'un
 * monde (hors bannière hero, toujours fixe en tête) — voir `worldHomeGrid.ts`
 * pour le système de grille actuel, qui remplace l'ancien ordre à colonne
 * unique (`worlds.home_layout`, encore lu ici pour la synthèse de repli).
 * `"announcement"` n'est plus un widget plaçable (remplacé par les blocs
 * html génériques de la grille) mais reste un id historique valide, pour
 * que `resolveWorldHomeLayout` continue de le reconnaître dans les anciens
 * `home_layout` — sa synthèse en bloc html est gérée par `worldHomeGrid.ts`.
 */
export type WorldHomeWidgetId =
  | "categories"
  | "composer"
  | "chatrooms"
  | "stats"
  | "members_online"
  | "announcement"
  | "wiki_shortcuts"
  | "personas_recent";

export const ALL_WORLD_HOME_WIDGETS: WorldHomeWidgetId[] = [
  "categories",
  "composer",
  "chatrooms",
  "stats",
  "members_online",
  "announcement",
  "wiki_shortcuts",
  "personas_recent",
];

/** Ordre affiché avant que l'admin n'ait jamais personnalisé la page. */
export const DEFAULT_WORLD_HOME_LAYOUT: WorldHomeWidgetId[] = [
  "categories",
  "composer",
  "chatrooms",
];

function isWorldHomeWidgetId(value: unknown): value is WorldHomeWidgetId {
  return typeof value === "string" && (ALL_WORLD_HOME_WIDGETS as string[]).includes(value);
}

/**
 * Résout la valeur brute stockée en base vers une liste d'ids valides.
 * `null`/non-tableau retombe sur l'ordre par défaut ; un tableau vide est une
 * désactivation volontaire de tous les widgets et reste vide. Les entrées
 * inconnues (widget supprimé depuis) sont filtrées silencieusement, et si un
 * tableau non vide ne contient plus que des entrées invalides, on retombe
 * aussi sur l'ordre par défaut plutôt que d'afficher une page vide involontaire.
 */
export function resolveWorldHomeLayout(raw: unknown): WorldHomeWidgetId[] {
  if (!Array.isArray(raw)) return DEFAULT_WORLD_HOME_LAYOUT;
  if (raw.length === 0) return [];
  const seen = new Set<WorldHomeWidgetId>();
  const filtered = raw.filter((id): id is WorldHomeWidgetId => {
    if (!isWorldHomeWidgetId(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return filtered.length > 0 ? filtered : DEFAULT_WORLD_HOME_LAYOUT;
}
