export type PersonaFieldType = "title" | "text" | "stats" | "separator" | "input" | "textarea" | "image-grid";

/** Une stat individuelle dans un champ de type "stats". */
export interface PersonaStat {
  id: string;
  label: string;
  value: string;
  unit?: string;
}

export interface PersonaSectionField {
  id: string;
  section_id: string;
  type: PersonaFieldType;
  position: number;
  data: any; // { text: string, format?: "markdown" } etc.
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
