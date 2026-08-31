export type PersonaFieldType = "title" | "text" | "stats" | "separator" | "input" | "textarea" | "image-grid" | "inventory" | "skills" | "gauges" | "quote" | "traits" | "timeline" | "dl";

/** Une stat individuelle dans un champ de type "stats". */
export interface PersonaStat {
  id: string;
  label: string;
  value: string;
  unit?: string;
}

/** Une image dans un champ de type "image-grid". `x`/`y`/`w` (position et
 *  largeur en colonnes, voir components/personas/personaImageGrid.ts) sont
 *  absents pour une image tout juste ajoutée — placée automatiquement au
 *  prochain calcul de grille (`resolvePersonaImageGrid`) plutôt que d'exiger
 *  une position dès l'upload. `bg` (fond derrière l'image, utile quand elle
 *  ne remplit pas toute sa case en `object-contain`) est omis quand vrai —
 *  c'est le comportement par défaut — et vaut `false` seulement s'il a été
 *  désactivé. */
export interface PersonaGridImage {
  id: string;
  url: string;
  caption?: string;
  x?: number;
  y?: number;
  w?: number;
  bg?: boolean;
}

/** Un item dans un champ de type "inventory". */
export interface InventoryItem {
  id: string;
  catalog_id?: string; // défini quand le monde a restrict_inventory
  name: string;
  quantity: number;
  description?: string;
  icon?: string; // chemin relatif depuis /rpg_icons/, ex: "sword.svg"
}

/** Une compétence dans un champ de type "skills". */
export interface SkillItem {
  id: string;
  catalog_id?: string; // défini quand le monde a restrict_skills
  name: string;
  level: string; // texte libre ou nombre
  description?: string;
  icon?: string; // chemin relatif depuis /rpg_icons/, ex: "magic.svg"
}

/** Une jauge dans un champ de type "gauges". */
export interface GaugeItem {
  id: string;
  name: string;
  value: number;
  max: number;
  color: string; // couleur hex, ex: "#6366f1"
}

/** Un trait de personnalité dans un champ de type "traits". */
export interface TraitItem {
  id: string;
  label: string;
}

/** Un événement dans un champ de type "timeline". */
export interface TimelineItem {
  id: string;
  date?: string; // texte libre, ex: "Printemps 1347"
  title: string;
  description?: string;
}

/** Une entrée label/description dans un champ de type "dl". */
export interface DlItem {
  id: string;
  label: string;
  description: string;
}

/** Contenu JSON d'un champ de persona. La forme dépend du `type` du champ. */
export interface PersonaFieldData {
  text?: string;
  format?: string;
  value?: string;
  items?: PersonaStat[];
  images?: PersonaGridImage[];
  inventoryItems?: InventoryItem[];
  skillItems?: SkillItem[];
  gaugeItems?: GaugeItem[];
  quoteText?: string;
  quoteSource?: string;
  traitItems?: TraitItem[];
  timelineItems?: TimelineItem[];
  dlItems?: DlItem[];
  [key: string]: unknown;
}

export interface PersonaSectionField {
  id: string;
  section_id: string;
  type: PersonaFieldType;
  position: number;
  data: PersonaFieldData;
  /** Champ requis par la fiche modèle du monde : insupprimable hors modèle. */
  locked?: boolean;
}

export interface PersonaSection {
  id: string;
  persona_id: string;
  name: string;
  position: number;
}

export interface PersonaSectionWithFields extends PersonaSection {
  fields: PersonaSectionField[];
}
