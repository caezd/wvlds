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

export interface WorldLexiconTerm {
  id: string;
  world_id: string;
  term: string;
  description: string;
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
  /** Carte du monde. Absent = activée (défaut en base). */
  enable_map?: boolean | null;
  /** Wiki du monde. Absent = activé (défaut en base). */
  enable_wiki?: boolean | null;
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

/**
 * Salon tel qu'affiché sur la page d'accueil d'un monde et dans ses blocs.
 *
 * Ce type était recopié à l'identique dans WorldHome, WorldHomeGridView et
 * WorldChatroomsGrid — trois copies qu'un champ ajouté d'un seul côté aurait
 * fait diverger en silence (`timeline_date` manquait déjà dans la troisième).
 */
export type WorldHomeRoom = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  last_poster_avatar_url?: string | null;
  unread_count: number;
  category_id?: string | null;
  timeline_date?: WorldTimelineDate | null;
};

/** Auteur d'une annotation, tel que joint depuis `profiles`. */
export type WikiAnnotationAuthor = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

/**
 * Commentaire ancré à un extrait d'une page de wiki — voir les migrations 137
 * et 140, et `lib/wikiAnnotations.ts`. À ne pas confondre avec les notes de
 * page (`WikiPageNote`), qui ne sont ancrées à aucun passage. Les champs `anchor_*` ne sont remplis que sur la
 * racine d'un fil ; une réponse (`parent_id` non nul) hérite de son ancre.
 */
export type WikiAnnotation = {
  id: string;
  page_id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  anchor_quote: string | null;
  anchor_prefix: string | null;
  anchor_suffix: string | null;
  anchor_start: number | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  author: WikiAnnotationAuthor | null;
};

/** Racine et ses réponses, dans l'ordre de publication. */
export type WikiAnnotationThread = {
  root: WikiAnnotation;
  replies: WikiAnnotation[];
};

/**
 * Catégorie du panneau de notes d'une page de wiki (migration 139) — repliable
 * et réordonnable, propre à sa page.
 */
export type WikiNoteCategory = {
  id: string;
  page_id: string;
  name: string;
  sort_index: number;
};

/**
 * Fiche du panneau de notes : un titre, un corps en markdown, une catégorie.
 * Contrairement à `WikiAnnotation`, elle n'est ancrée à aucun passage du texte.
 */
export type WikiPageNote = {
  id: string;
  category_id: string;
  page_id: string;
  title: string;
  body: string;
  sort_index: number;
};
