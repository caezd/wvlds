export interface WorldTimelineConfig {
  year_label: string;
  era_name: string | null;
  month_names: string[];
  current_year: number;
  current_month: number | null;
  /** Jours par mois, même index que `month_names` — un mois sans entrée
   *  (tableau absent, ou plus court que `month_names`) retombe sur
   *  DEFAULT_DAYS_PER_MONTH, voir daysInMonth() dans lib/worldTimeline.ts. */
  days_per_month?: number[];
}

export interface WorldTimelineDate {
  year: number;
  month: number | null;
  day: number | null;
}

export interface WorldCatalogCategory {
  id: string;
  world_id: string;
  type: "inventory" | "skills";
  name: string;
  sort_index: number;
  column_index: number;
}

export interface WorldInventoryItem {
  id: string;
  world_id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sort_index: number;
  category_id?: string | null;
}

export interface WorldSkill {
  id: string;
  world_id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  sort_index: number;
  category_id?: string | null;
}

export interface WorldMap {
  id: string;
  world_id: string;
  image_url: string | null;
  label: string;
}

export interface WorldMapPin {
  id: string;
  world_id: string;
  x: number;
  y: number;
  title: string;
  description: string | null;
  banner_url: string | null;
  color: string;
  icon: string;
  icon_color: string;
  border_color: string | null;
  border_style: string;
  sort_index: number;
}

export interface ChatroomCategory {
  id: string;
  world_id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  icon_url: string | null;
  position: number;
}

export interface WorldTag {
  id: string;
  world_id: string;
  tag: string;
  created_at: string;
}

export type World = {
  id: string;
  name: string;
  description?: string | null;
  icon_url?: string | null;
  banner_url?: string | null;
  color?: string | null; // hex (#RRGGBB)
  visibility?: string | null;
  enable_inventory?: boolean | null;
  enable_skills?: boolean | null;
  enable_faceclaims?: boolean | null;
  restrict_inventory?: boolean | null;
  restrict_skills?: boolean | null;
  timeline_enabled?: boolean | null;
  timeline_config?: WorldTimelineConfig | null;
  allows_real_avatars?: boolean | null;
  allows_illustrated_avatars?: boolean | null;
  is_age_restricted?: boolean | null;
  /** Libellé personnalisé du lien wiki dans la sidebar (ex: "Compendium") — null = libellé traduit par défaut. */
  wiki_label?: string | null;
  /** Ancien ordre des widgets de la page d'accueil (remplacé par `home_grid`) —
   *  conservé pour la synthèse de repli, voir resolveWorldHomeGrid(). */
  home_layout?: string[] | null;
  /** Ancien HTML/CSS libre du widget « Annonce » (remplacé par les blocs html
   *  de `home_grid`) — conservé pour la synthèse de repli. */
  announcement_html?: string | null;
  announcement_size?: "sm" | "md" | "lg" | null;
  /** Grille de blocs de la page d'accueil, réglée par un admin — null = synthèse
   *  depuis l'ancien système, voir resolveWorldHomeGrid(). */
  home_grid?: unknown[] | null;
  /** Couleur de fond (hex) sous la bannière de la page d'accueil — null = couleur par défaut du thème. */
  home_body_color?: string | null;
  /** Couleur de fond (hex) du panel de contenu de la page d'accueil — null = couleur par défaut du thème. */
  home_panel_color?: string | null;
  /** Affiche le bloc statistiques sous le titre/description de la page d'accueil
   *  (position fixe, pas un bloc de la grille) — null/false = masqué. */
  home_show_stats?: boolean | null;
  /** Gouttière entre les blocs de la grille de la page d'accueil — un des
   *  préréglages de HOME_GRID_GAP_PRESETS, null = "comfortable". Partagé par
   *  le rendu public et l'éditeur, voir resolveHomeGridGap(). */
  home_grid_gap?: string | null;
};
