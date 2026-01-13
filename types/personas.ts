export type PersonaFieldType = "title" | "text";

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
