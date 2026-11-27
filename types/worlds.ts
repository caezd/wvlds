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
  /** Les salons ne se situent que dans la période en cours : l'année
   *  courante, et le mois courant s'il y en a un. Voir `currentPeriodLock`. */
  restrict_to_current?: boolean;
  /** Un salon ne se crée pas sans date : le choix paraît sous son titre. */
  require_date?: boolean;
  /** Les entrées datées des journaux de personas paraissent sur la frise. */
  show_journals?: boolean;
  /** Saisons : des âges nommés qui découpent les années de la frise. */
  ages?: WorldTimelineAge[];
  /** Les fêtes du calendrier, rappelées chaque année à leur date. */
  holidays?: WorldTimelineHoliday[];
  /** Jours sans message après lesquels un salon en cours s'endort sur la
   *  frise ; 0 : jamais. Absent : DEFAULT_DORMANT_DAYS (30). */
  dormant_days?: number;
}

/** Une fête du calendrier (« Fête des lanternes », 9 du 6e mois) ; le mois
 *  est l'index dans `month_names`, le jour peut manquer (tout le mois). */
export type WorldTimelineHoliday = { name: string; month: number; day: number | null };

/** Un âge nommé de la chronologie (« L'Âge des Cendres », an 1 à 40) ; sans
 *  année de fin, il court jusqu'à la suivante. */
export type WorldTimelineAge = { name: string; from_year: number; to_year: number | null };

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
  /** Présentation affichée en tête quand la catégorie est dépliée (migration 185). */
  description?: string | null;
  banner_url?: string | null;
}

/** Les cinq degrés de rareté d'un objet — voir CATALOG_RARITIES. */
export type WorldCatalogRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Une propriété libre d'un objet : « Poids », « 2 kg ». */
export interface WorldCatalogProperty {
  label: string;
  value: string;
}

/**
 * Un objet ou une compétence du catalogue d'un monde.
 *
 * Une seule forme pour les deux, distinguée par `type` — voir la migration 161.
 * `stackable` et `max_quantity` ne concernent que les objets : une compétence
 * ne se compte pas, l'interface ne les propose pas pour elle.
 */
export interface WorldCatalogItem {
  id: string;
  world_id: string;
  type: "inventory" | "skills";
  name: string;
  description?: string | null;
  /**
   * Le visuel de l'objet, en trois sources exclusives à l'usage.
   *
   * Une seule s'affiche, de la plus précise à la plus générique :
   * `image_url` > `lucide_icon` > `icon`. Voir `resolveCatalogEntry`.
   */
  /** Icône du jeu `rpg_icons`, ex. « sword.svg ». */
  icon?: string | null;
  /** Icône Lucide en kebab-case, ex. « swords » — voir la migration 164. */
  lucide_icon?: string | null;
  /** Image propre au monde, téléversée dans le bucket `worlds`. */
  image_url?: string | null;
  rarity?: WorldCatalogRarity | null;
  stackable?: boolean;
  max_quantity?: number | null;
  properties?: WorldCatalogProperty[];
  sort_index: number;
  category_id?: string | null;
  /** Marqué supprimé, en corbeille — voir la migration 165. */
  deleted_at?: string | null;
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
  /** Une fiche sans faceclaim n'est pas « terminée » (migration 191). */
  require_faceclaim?: boolean | null;
  /** Carte du monde. Absent = activée (défaut en base). */
  enable_map?: boolean | null;
  /** Wiki du monde. Absent = activé (défaut en base). */
  enable_wiki?: boolean | null;
  /** Chatbox du monde (migration 237). Éteinte par défaut : activée ici seulement. */
  enable_live_chat?: boolean | null;
  /** Chatbox : messages gardés par salle, 25 à 100 (migrations 239 et 240). Absent = 100. */
  live_chat_retention?: number | null;
  /** Options de la chatbox (migration 241), éteintes par défaut. */
  live_chat_colors?: boolean | null;
  live_chat_bubbles?: boolean | null;
  live_chat_personas?: boolean | null;
  live_chat_actions?: boolean | null;
  /** Connexion à la chatbox (migration 244), voir lib/worldLiveChatConnection. */
  live_chat_join_mode?: "auto" | "button" | null;
  live_chat_idle_minutes?: number | null;
  live_chat_offline_view?: "none" | "read" | null;
  /** Économie (migration 246) : la monnaie et ses paliers, voir lib/worldCurrency. */
  enable_economy?: boolean | null;
  /** Option Boutiques (migration 250) ; coupée par défaut. */
  enable_shops?: boolean | null;
  /** Échanges entre personas, et entre personas d'un même compte (migration 251) ; coupés par défaut. */
  enable_trades?: boolean | null;
  trades_same_account?: boolean | null;
  /** Gains automatiques (migrations 252, 253), en unités de base ; voir lib/worldGains. */
  gain_message?: number | null;
  gain_scene_joined?: number | null;
  gain_scene_created?: number | null;
  gain_scene_completed?: number | null;
  gain_daily_login?: number | null;
  gain_message_cooldown?: number | null;
  gain_daily_cap?: number | null;
  /** Taxe des personas (migration 255), voir lib/worldTax. */
  tax_enabled?: boolean | null;
  tax_amount?: number | null;
  tax_every?: number | null;
  tax_unit?: "day" | "week" | "month" | null;
  tax_anchor?: string | null;
  tax_mode?: "manual" | "auto" | null;
  tax_accumulate?: boolean | null;
  tax_grace_new?: boolean | null;
  tax_badge_enabled?: boolean | null;
  tax_badge_label?: string | null;
  tax_badge_color?: string | null;
  tax_badge_icon?: string | null;
  currency_units?: unknown;
  /** Inventaire des personas (migration 247), voir lib/personaInventory. */
  inventory_mode?: "free" | "catalog" | "held" | null;
  inventory_slots_default?: number | null;
  inventory_slots_max?: number | null;
  inventory_slot_cost?: number | null;
  restrict_inventory?: boolean | null;
  restrict_skills?: boolean | null;
  /** Les dés permis dans les salons (migration 270), voir lib/worldDice. */
  dice_mode?: "free" | "predefined" | null;
  /** Un lancer publié peut-il être modifié (sa description) ? */
  dice_allow_edit?: boolean | null;
  /** Critique et échec critique (migration 273). */
  dice_critical?: boolean | null;
  dice_fumble?: boolean | null;
  timeline_enabled?: boolean | null;
  /** Validation des fiches (migration 184) — active seulement avec une fiche par défaut. */
  persona_review_enabled?: boolean | null;
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
  /**
   * Type du bloc visé (`p`, `li`, `blockquote`, `h2`…) — voir migration 142.
   *
   * Renseigné, l'ancre porte sur un bloc et les quatre champs suivants
   * décrivent ce bloc. Nul, c'est une ancre de sélection d'avant la
   * migration : les mêmes champs décrivent alors un extrait de caractères.
   */
  anchor_block_type: string | null;
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
