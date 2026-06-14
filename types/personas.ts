export type PersonaFieldType = "title" | "text" | "stats" | "separator" | "input" | "textarea" | "image-grid";

/** Une stat individuelle dans un champ de type "stats". */
export interface PersonaStat {
  id: string;
  label: string;
  value: string;
  unit?: string;
}

/** Une image dans un champ de type "image-grid". */
export interface PersonaGridImage {
  id: string;
  url: string;
  caption?: string;
}

/** Contenu JSON d'un champ de persona. La forme dépend du `type` du champ. */
export interface PersonaFieldData {
  text?: string;
  format?: string;
  value?: string;
  items?: PersonaStat[];
  images?: PersonaGridImage[];
  [key: string]: unknown;
}

export interface PersonaSectionField {
  id: string;
  section_id: string;
  type: PersonaFieldType;
  position: number;
  data: PersonaFieldData;
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
